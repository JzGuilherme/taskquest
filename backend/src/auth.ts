import { Router, type RequestHandler, type Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool, sql } from './db';
import { config, production } from './config';
import { asyncRoute } from './http';
import { emptySchema, loginSchema, registerSchema, validate } from './validation';
import { limiter, sessionOrigin } from './security';
import { logger } from './logger';
import { passwordResetRoutes } from './password-reset';

export interface Identity { id: number; name: string; role: 'Admin' | 'Dev'; sid: string; }
interface Account { id: number; name: string; role: 'Admin' | 'Dev'; password_hash: string | null; is_active: boolean; mfa_enabled: boolean; }
const cookieName = production ? '__Secure-taskcorp-refresh' : 'taskcorp-refresh';
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict' as const, path: '/api/auth' };
const tokenHash = (token: string) => createHash('sha256').update(token).digest();
const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), 12);
const refreshValue = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{64}$/.test(value);

function respondSession(res: Response, user: Account, sid: string, refresh: string, expires: Date): void {
  const accessToken = jwt.sign({ sid }, config.JWT_SECRET, { subject: String(user.id), algorithm: 'HS256', expiresIn: '10m', issuer: 'taskcorp-api', audience: 'taskcorp-web' });
  res.cookie(cookieName, refresh, { ...cookieOptions, expires });
  res.json({ accessToken, expiresIn: 600, user: { id: user.id, name: user.name, role: user.role } });
}

export const authenticate: RequestHandler = asyncRoute(async (req, res, next) => {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) { res.status(401).json({ message: 'Autenticação necessária.' }); return; }
  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(authorization.slice(7), config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'taskcorp-api', audience: 'taskcorp-web' });
    if (typeof decoded === 'string' || !decoded.sub || !/^[1-9]\d*$/.test(decoded.sub) || typeof decoded.sid !== 'string' || !/^[0-9a-f-]{36}$/i.test(decoded.sid)) throw new Error('Token inválido');
    payload = decoded;
  } catch { res.status(401).json({ message: 'Sessão inválida ou expirada.' }); return; }
  const result = await pool.request().input('id', sql.Int, Number(payload.sub)).input('sid', sql.UniqueIdentifier, payload.sid)
    .query(`SELECT u.id, u.name, u.role FROM dbo.Users u JOIN dbo.AuthFamilies f ON f.user_id = u.id
      WHERE u.id = @id AND f.id = @sid AND u.is_active = 1 AND u.mfa_enabled = 0 AND f.revoked_at IS NULL AND f.expires_at > SYSUTCDATETIME()`);
  if (!result.recordset.length) { res.status(401).json({ message: 'Sessão revogada ou expirada.' }); return; }
  res.locals.auth = { ...result.recordset[0], sid: payload.sid } satisfies Identity;
  next();
});

export const adminOnly: RequestHandler = (_req, res, next) => {
  if ((res.locals.auth as Identity).role !== 'Admin') { res.status(403).json({ message: 'Acesso restrito a administradores.' }); return; }
  next();
};

export const authRoutes = Router();
authRoutes.use(validate(emptySchema, 'query'));
authRoutes.use(passwordResetRoutes);
authRoutes.post('/register', sessionOrigin, limiter('taskcorp:register:', 5, 15 * 60 * 1000), validate(registerSchema), asyncRoute(async (_req, res) => {
  const { name, email, password } = res.locals.body;
  const hash = await bcrypt.hash(password, 12);
  await pool.request().input('name', sql.NVarChar(100), name).input('email', sql.NVarChar(254), email).input('hash', sql.VarChar(60), hash)
    .query("INSERT INTO dbo.Users (name, email, password_hash, role, is_active) VALUES (@name, @email, @hash, 'Dev', 1)");
  res.status(201).json({ message: 'Conta criada. Entre com seu e-mail e senha.' });
}));
authRoutes.post('/login', sessionOrigin, limiter('taskcorp:login:', 10, 15 * 60 * 1000), validate(loginSchema), asyncRoute(async (_req, res) => {
  const { email, password } = res.locals.body;
  const result = await pool.request().input('email', sql.NVarChar(254), email)
    .query<Account>('SELECT id, name, role, password_hash, is_active, mfa_enabled FROM dbo.Users WHERE email = @email');
  const user = result.recordset[0];
  const matches = await bcrypt.compare(password, user?.password_hash ?? await dummyHash);
  if (!user || !user.is_active || !user.password_hash || !matches) {
    logger.warn({ event: 'login_failed' });
    res.status(401).json({ message: 'Credenciais inválidas.' }); return;
  }
  if (user.mfa_enabled) { res.status(403).json({ message: 'MFA obrigatório: autenticação indisponível até concluir a integração de segundo fator.' }); return; }
  const sid = randomUUID();
  const refresh = randomBytes(48).toString('base64url');
  const expires = new Date(Date.now() + 7 * 86400000);
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    await transaction.request().input('sid', sql.UniqueIdentifier, sid).input('user', sql.Int, user.id).input('expires', sql.DateTime2, expires)
      .query('INSERT INTO dbo.AuthFamilies (id, user_id, expires_at) VALUES (@sid, @user, @expires)');
    await transaction.request().input('hash', sql.VarBinary(32), tokenHash(refresh)).input('sid', sql.UniqueIdentifier, sid)
      .query('INSERT INTO dbo.AuthRefreshTokens (token_hash, family_id) VALUES (@hash, @sid)');
    await transaction.commit();
  } catch (error) { await transaction.rollback().catch(() => undefined); throw error; }
  logger.info({ event: 'login_success', userId: user.id });
  respondSession(res, user, sid, refresh, expires);
}));

authRoutes.post('/refresh', sessionOrigin, limiter('taskcorp:refresh:', 60, 15 * 60 * 1000), validate(emptySchema), asyncRoute(async (req, res) => {
  const oldToken: unknown = req.cookies?.[cookieName];
  if (!refreshValue(oldToken)) { res.status(401).json({ message: 'Sessão inválida.' }); return; }
  const transaction = pool.transaction();
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let committed = false;
  try {
    const result = await transaction.request().input('hash', sql.VarBinary(32), tokenHash(oldToken)).query(`
      SELECT t.used_at, f.id AS sid, f.expires_at, f.revoked_at, u.id, u.name, u.role, u.is_active, u.mfa_enabled
      FROM dbo.AuthRefreshTokens t WITH (UPDLOCK, HOLDLOCK)
      JOIN dbo.AuthFamilies f WITH (UPDLOCK, HOLDLOCK) ON f.id = t.family_id
      JOIN dbo.Users u ON u.id = f.user_id WHERE t.token_hash = @hash`);
    const session = result.recordset[0];
    if (!session || session.used_at || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now() || !session.is_active || session.mfa_enabled) {
      if (session?.used_at) {
        await transaction.request().input('sid', sql.UniqueIdentifier, session.sid).query('UPDATE dbo.AuthFamilies SET revoked_at = SYSUTCDATETIME() WHERE id = @sid');
        logger.warn({ event: 'refresh_reuse_detected', userId: session.id });
      }
      await transaction.commit(); committed = true;
      res.clearCookie(cookieName, cookieOptions);
      res.status(401).json({ message: 'Sessão inválida ou expirada.' }); return;
    }
    const refresh = randomBytes(48).toString('base64url');
    await transaction.request().input('old', sql.VarBinary(32), tokenHash(oldToken)).input('next', sql.VarBinary(32), tokenHash(refresh)).input('sid', sql.UniqueIdentifier, session.sid)
      .query(`UPDATE dbo.AuthRefreshTokens SET used_at = SYSUTCDATETIME() WHERE token_hash = @old;
        INSERT INTO dbo.AuthRefreshTokens (token_hash, family_id) VALUES (@next, @sid);`);
    await transaction.commit(); committed = true;
    respondSession(res, session, session.sid, refresh, new Date(session.expires_at));
  } catch (error) { if (!committed) await transaction.rollback().catch(() => undefined); throw error; }
}));

authRoutes.post('/logout', sessionOrigin, validate(emptySchema), asyncRoute(async (req, res) => {
  const refresh: unknown = req.cookies?.[cookieName];
  if (refreshValue(refresh)) {
    await pool.request().input('hash', sql.VarBinary(32), tokenHash(refresh)).query(`
      UPDATE f SET revoked_at = SYSUTCDATETIME() FROM dbo.AuthFamilies f
      JOIN dbo.AuthRefreshTokens t ON t.family_id = f.id WHERE t.token_hash = @hash`);
  }
  res.clearCookie(cookieName, cookieOptions);
  res.status(204).end();
}));
authRoutes.get('/me', authenticate, (_req, res) => { const { id, name, role } = res.locals.auth as Identity; res.json({ id, name, role }); });

