import { z } from 'zod';
import { type RequestHandler } from 'express';
export const id = z.number().int().positive().max(2147483647);
export const password = z.string().min(12).refine(value => Buffer.byteLength(value, 'utf8') <= 72);
export const email = z.string().trim().toLowerCase().email().max(254);
export const createUserSchema = z.object({ name: z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/u), email, password, role: z.enum(['Admin', 'Dev']).default('Dev') }).strict();
export const loginSchema = z.object({ email, password: z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 72) }).strict();
export const registerSchema = createUserSchema.omit({ role: true }).strict();
export const statusSchema = z.object({ status: z.enum(['To Do', 'Doing', 'Done']) }).strict();
export const taskSchema = z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).nullable().optional(), assigned_to: id, status: statusSchema.shape.status.default('To Do') }).strict();
export const focusSchema = z.object({ user_id: id, duration_minutes: z.number().int().min(1).max(1440) }).strict();
export const emptySchema = z.object({}).strict();
export const idParams = z.object({ id: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(id) }).strict();
export const validate = (schema: z.ZodType, source: 'body' | 'params' | 'query' = 'body'): RequestHandler => (req, res, next) => {
  const parsed = schema.safeParse(req[source] ?? {});
  if (!parsed.success) { res.status(400).json({ message: 'Dados inválidos.', fields: parsed.error.issues.map(issue => issue.path.join('.')) }); return; }
  res.locals[source] = parsed.data;
  next();
};
