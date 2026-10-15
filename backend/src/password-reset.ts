import { Router } from 'express';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { config } from './config';
import { pool, sql } from './db';
import { asyncRoute } from './http';
import { email, password, validate } from './validation';
import { limiter, sessionOrigin } from './security';
import { logger } from './logger';

export const forgotSchema = z.object({ email }).strict();
export const resetSchema = z.object({ email, code: z.string().regex(/^\d{8}$/), password }).strict();
const digest = (id: number, code: string) => createHmac('sha256', config.JWT_SECRET).update(`password-reset:${id}:${code}`).digest();
const mailer = config.SMTP_USER && config.SMTP_PASSWORD ? nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }, connectionTimeout: 10000, socketTimeout: 15000, logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true }) : undefined;
export const passwordResetRoutes = Router();
passwordResetRoutes.post('/forgot-password', sessionOrigin, limiter('taskcorp:forgot:', 5, 15 * 60000), validate(forgotSchema), asyncRoute(async (_req, res) => {
  if (!mailer) { res.status(503).json({ message: 'Envio de e-mail ainda não configurado. Contate o administrador.' }); return; }
  const address: string = res.locals.body.email;
  res.status(202).json({ message: 'Se a conta estiver ativa, você receberá um código por e-mail. Verifique também o spam. Um novo código pode ser solicitado após 10 minutos.' });
  const transaction = pool.transaction();
  let active = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE); active = true;
    const account = (await transaction.request().input('email', sql.NVarChar(254), address).query('SELECT id FROM dbo.Users WHERE email = @email AND is_active = 1')).recordset[0];
    if (!account) { await transaction.commit(); active = false; return; }
    const existing = (await transaction.request().input('id', sql.Int, account.id).query('SELECT user_id FROM dbo.PasswordResets WITH (UPDLOCK, HOLDLOCK) WHERE user_id = @id AND requested_at > DATEADD(MINUTE, -10, SYSUTCDATETIME())')).recordset[0];
    if (existing) { await transaction.commit(); active = false; return; }
    const code = randomInt(0, 100000000).toString().padStart(8, '0');
    const hash = digest(account.id, code);
    await transaction.request().input('id', sql.Int, account.id).input('hash', sql.VarBinary(32), hash).query(`
      UPDATE dbo.PasswordResets SET code_hash = @hash, requested_at = SYSUTCDATETIME(), expires_at = DATEADD(MINUTE, 10, SYSUTCDATETIME()), attempts = 0, used_at = NULL WHERE user_id = @id;
      IF @@ROWCOUNT = 0 INSERT INTO dbo.PasswordResets (user_id, code_hash, expires_at) VALUES (@id, @hash, DATEADD(MINUTE, 10, SYSUTCDATETIME()));`);
    await transaction.commit(); active = false;
    try {
      await mailer.sendMail({ from: config.SMTP_USER, to: address, subject: 'TaskCorp Insights — código de recuperação', text: `Seu código de recuperação é: ${code}\n\nEle expira em 10 minutos e pode ser usado apenas uma vez. Se você não solicitou a recuperação, ignore este e-mail.` });
    } catch {
      await pool.request().input('id', sql.Int, account.id).input('hash', sql.VarBinary(32), hash).query('UPDATE dbo.PasswordResets SET used_at = SYSUTCDATETIME() WHERE user_id = @id AND code_hash = @hash');
      logger.error({ event: 'password_reset_email_failed' });
    }
  } catch { if (active) await transaction.rollback().catch(() => undefined); logger.error({ event: 'password_reset_request_failed' }); }
}));
passwordResetRoutes.post('/reset-password', sessionOrigin, limiter('taskcorp:reset:', 10, 15 * 60000), validate(resetSchema), asyncRoute(async (_req, res) => {
  const { email: address, code, password: nextPassword } = res.locals.body;
  const hash = await bcrypt.hash(nextPassword, 12);
  const transaction = pool.transaction();
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let committed = false;
  try {
    const result = await transaction.request().input('email', sql.NVarChar(254), address).query(`
      SELECT r.user_id, r.code_hash FROM dbo.PasswordResets r WITH (UPDLOCK, HOLDLOCK)
      JOIN dbo.Users u ON u.id = r.user_id WHERE u.email = @email AND u.is_active = 1
      AND r.used_at IS NULL AND r.expires_at > SYSUTCDATETIME() AND r.attempts < 5`);
    const reset = result.recordset[0];
    if (!reset || !timingSafeEqual(reset.code_hash, digest(reset.user_id, code))) {
      if (reset) await transaction.request().input('id', sql.Int, reset.user_id).query('UPDATE dbo.PasswordResets SET attempts = attempts + 1 WHERE user_id = @id');
      await transaction.commit(); committed = true;
      res.status(400).json({ message: 'Código inválido ou expirado.' }); return;
    }
    await transaction.request().input('id', sql.Int, reset.user_id).input('hash', sql.VarChar(60), hash).query(`
      UPDATE dbo.Users SET password_hash = @hash WHERE id = @id;
      UPDATE dbo.PasswordResets SET used_at = SYSUTCDATETIME() WHERE user_id = @id;
      UPDATE dbo.AuthFamilies SET revoked_at = SYSUTCDATETIME() WHERE user_id = @id AND revoked_at IS NULL;`);
    await transaction.commit(); committed = true;
    res.json({ message: 'Senha atualizada. Entre novamente com sua nova senha.' });
  } catch (error) { if (!committed) await transaction.rollback().catch(() => undefined); throw error; }
}));

