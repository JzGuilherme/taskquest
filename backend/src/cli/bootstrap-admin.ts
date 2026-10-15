import bcrypt from 'bcrypt';
import sql from 'mssql';
import { managementPool } from './management-db';
import { createUserSchema } from '../validation';
import { readFileSync } from 'node:fs';
async function bootstrap(): Promise<void> {
  const password = process.env.ADMIN_PASSWORD_FILE ? readFileSync(process.env.ADMIN_PASSWORD_FILE, 'utf8').trim() : process.env.ADMIN_PASSWORD;
  const user = createUserSchema.parse({ name: process.env.ADMIN_NAME, email: process.env.ADMIN_EMAIL, password, role: 'Admin' });
  const hash = await bcrypt.hash(user.password, 12);
  const pool = await managementPool().connect();
  const transaction = pool.transaction();
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await transaction.request().input('name', sql.NVarChar(100), user.name).input('email', sql.NVarChar(254), user.email).input('hash', sql.VarChar(60), hash).query(`
      IF EXISTS (SELECT 1 FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE role = 'Admin' AND is_active = 1)
        THROW 51000, 'Já existe um administrador ativo.', 1;
      IF EXISTS (SELECT 1 FROM dbo.Users WHERE email = @email)
        UPDATE dbo.Users SET password_hash = @hash, role = 'Admin', is_active = 1 WHERE email = @email;
      ELSE INSERT INTO dbo.Users (name, email, password_hash, role, is_active) VALUES (@name, @email, @hash, 'Admin', 1);`);
    await transaction.commit();
    console.log('Administrador inicial configurado.');
  } catch (error) { await transaction.rollback().catch(() => undefined); throw error; }
  finally { await pool.close(); }
}
void bootstrap().catch(() => { console.error('Falha no bootstrap. Verifique as credenciais, a política de senha e se já existe um administrador.'); process.exitCode = 1; });
