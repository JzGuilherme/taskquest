import { readFileSync } from 'node:fs';
import sql from 'mssql';
import { config } from '../config';
export function managementPool(): sql.ConnectionPool {
  const user = process.env.MIGRATION_DB_USER;
  const password = process.env.MIGRATION_DB_PASSWORD_FILE ? readFileSync(process.env.MIGRATION_DB_PASSWORD_FILE, 'utf8').trim() : process.env.MIGRATION_DB_PASSWORD;
  if (!user || !password) throw new Error('Credenciais exclusivas de migrations são obrigatórias.');
  return new sql.ConnectionPool({ server: config.DB_SERVER, port: config.DB_PORT, database: config.DB_DATABASE, user, password, options: { encrypt: true, trustServerCertificate: config.DB_TRUST_CERTIFICATE === 'true', abortTransactionOnError: true } });
}
