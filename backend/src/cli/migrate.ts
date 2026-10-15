import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sql from 'mssql';
import { managementPool } from './management-db';

async function migrate(): Promise<void> {
  const rollback = process.argv.includes('--rollback');
  if (rollback && !process.env.ROLLBACK_BACKUP_REFERENCE) throw new Error('Informe ROLLBACK_BACKUP_REFERENCE antes de solicitar rollback.');
  const directory = resolve(process.cwd(), '../database/migrations');
  const files = readdirSync(directory).filter(file => /^\d{3}_[a-z_]+\.up\.sql$/.test(file)).sort();
  const pool = await managementPool().connect();
  const transaction = pool.transaction();
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await transaction.request().query(`DECLARE @result INT;
      EXEC @result = sys.sp_getapplock @Resource = N'taskcorp-migrations', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
      IF @result < 0 THROW 51000, 'Migration lock indisponível.', 1;
      IF OBJECT_ID(N'dbo.SchemaMigrations', N'U') IS NULL CREATE TABLE dbo.SchemaMigrations (name NVARCHAR(200) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME());`);
    const applied = (await transaction.request().query('SELECT name, checksum FROM dbo.SchemaMigrations ORDER BY name')).recordset;
    for (const migration of applied) {
      if (!files.includes(migration.name)) throw new Error('Migration aplicada ausente no repositório.');
      const digest = createHash('sha256').update(readFileSync(resolve(directory, migration.name))).digest('hex');
      if (digest !== migration.checksum) throw new Error('Checksum de migration aplicada foi alterado.');
    }
    if (rollback) {
      const last = applied.at(-1);
      if (!last) throw new Error('Nenhuma migration aplicada.');
      await transaction.request().batch(readFileSync(resolve(directory, last.name.replace('.up.sql', '.down.sql')), 'utf8'));
      await transaction.request().input('name', sql.NVarChar(200), last.name).query('DELETE FROM dbo.SchemaMigrations WHERE name = @name');
    } else {
      for (const file of files.filter(file => !applied.some(item => item.name === file))) {
        const contents = readFileSync(resolve(directory, file));
        for (const batch of contents.toString('utf8').split(/^GO[ \t]*\r?$/gim).filter(part => part.trim())) { await transaction.request().batch(batch); }
        await transaction.request().input('name', sql.NVarChar(200), file).input('checksum', sql.Char(64), createHash('sha256').update(contents).digest('hex'))
          .query('INSERT INTO dbo.SchemaMigrations (name, checksum) VALUES (@name, @checksum)');
      }
    }
    await transaction.commit();
    console.log('Migrations concluídas.');
  } catch (error) { await transaction.rollback().catch(() => undefined); throw error; }
  finally { await pool.close(); }
}
void migrate().catch((error: unknown) => { console.error('Migration falhou; transação revertida.', error instanceof Error ? error.message : 'Erro desconhecido'); process.exitCode = 1; });


