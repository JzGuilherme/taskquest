import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool, sql } from './db';
import { adminOnly, authenticate, type Identity } from './auth';
import { asyncRoute } from './http';
import { createUserSchema, emptySchema, focusSchema, idParams, statusSchema, taskSchema, validate } from './validation';

export const apiRoutes = Router();
apiRoutes.use(authenticate, validate(emptySchema, 'query'));
apiRoutes.get('/users', asyncRoute(async (_req, res) => {
  const auth = res.locals.auth as Identity;
  const result = await pool.request().input('admin', sql.Bit, auth.role === 'Admin')
    .query('SELECT id, name, CASE WHEN @admin = 1 THEN email ELSE NULL END AS email FROM dbo.Users ORDER BY name');
  res.json(result.recordset);
}));
apiRoutes.post('/users', adminOnly, validate(createUserSchema), asyncRoute(async (_req, res) => {
  const { name, email, password, role } = res.locals.body;
  const hash = await bcrypt.hash(password, 12);
  const result = await pool.request().input('name', sql.NVarChar(100), name).input('email', sql.NVarChar(254), email)
    .input('hash', sql.VarChar(60), hash).input('role', sql.VarChar(5), role)
    .query(`INSERT INTO dbo.Users (name, email, password_hash, role, is_active)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.email VALUES (@name, @email, @hash, @role, 1)`);
  res.status(201).json(result.recordset[0]);
}));
apiRoutes.get('/tasks', asyncRoute(async (_req, res) => {
  const result = await pool.request().query('SELECT id, title, description, status, assigned_to, created_at FROM dbo.Tasks WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC');
  res.json(result.recordset);
}));
apiRoutes.post('/tasks', validate(taskSchema), asyncRoute(async (_req, res) => {
  const body = res.locals.body;
  const auth = res.locals.auth as Identity;
  if (auth.role !== 'Admin' && body.assigned_to !== auth.id) { res.status(403).json({ message: 'Desenvolvedores só podem criar tarefas para si.' }); return; }
  const result = await pool.request().input('title', sql.NVarChar(200), body.title).input('description', sql.NVarChar(2000), body.description ?? null)
    .input('status', sql.NVarChar(10), body.status).input('assigned_to', sql.Int, body.assigned_to)
    .query(`INSERT INTO dbo.Tasks (title, description, status, assigned_to)
      OUTPUT INSERTED.* VALUES (@title, @description, @status, @assigned_to)`);
  res.status(201).json(result.recordset[0]);
}));
apiRoutes.patch('/tasks/:id/status', validate(idParams, 'params'), validate(statusSchema), asyncRoute(async (_req, res) => {
  const auth = res.locals.auth as Identity;
  const result = await pool.request().input('id', sql.Int, res.locals.params.id).input('status', sql.NVarChar(10), res.locals.body.status)
    .input('admin', sql.Bit, auth.role === 'Admin').input('user', sql.Int, auth.id)
    .query('UPDATE dbo.Tasks SET status = @status OUTPUT INSERTED.* WHERE id = @id AND deleted_at IS NULL AND (@admin = 1 OR assigned_to = @user)');
  if (!result.recordset.length) { res.status(404).json({ message: 'Tarefa não encontrada ou sem permissão.' }); return; }
  res.json(result.recordset[0]);
}));
apiRoutes.delete('/tasks/:id', validate(idParams, 'params'), validate(emptySchema), asyncRoute(async (_req, res) => {
  const auth = res.locals.auth as Identity;
  const result = await pool.request().input('id', sql.Int, res.locals.params.id)
    .input('admin', sql.Bit, auth.role === 'Admin').input('user', sql.Int, auth.id)
    .query('UPDATE dbo.Tasks SET deleted_at = SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id = @id AND deleted_at IS NULL AND (@admin = 1 OR assigned_to = @user)');
  if (!result.recordset.length) { res.status(404).json({ message: 'Tarefa não encontrada ou sem permissão.' }); return; }
  res.status(204).end();
}));
apiRoutes.get('/focus', asyncRoute(async (_req, res) => {
  const auth = res.locals.auth as Identity;
  const result = await pool.request().input('admin', sql.Bit, auth.role === 'Admin').input('user', sql.Int, auth.id).query(`
    SELECT f.id, f.user_id, u.name AS user_name, f.duration_minutes, f.logged_date
    FROM dbo.FocusSessions f JOIN dbo.Users u ON u.id = f.user_id
    WHERE @admin = 1 OR f.user_id = @user ORDER BY f.logged_date DESC, f.id DESC`);
  res.json(result.recordset);
}));
apiRoutes.post('/focus', validate(focusSchema), asyncRoute(async (_req, res) => {
  const auth = res.locals.auth as Identity;
  const { user_id, duration_minutes } = res.locals.body;
  if (auth.role !== 'Admin' && user_id !== auth.id) { res.status(403).json({ message: 'Desenvolvedores só podem registrar seu próprio foco.' }); return; }
  const result = await pool.request().input('user_id', sql.Int, user_id).input('duration_minutes', sql.Int, duration_minutes)
    .query('INSERT INTO dbo.FocusSessions (user_id, duration_minutes) OUTPUT INSERTED.* VALUES (@user_id, @duration_minutes)');
  res.status(201).json(result.recordset[0]);
}));
