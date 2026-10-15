import sql from 'mssql';
import { config } from './config';
import { logger } from './logger';
export const pool = new sql.ConnectionPool({ server: config.DB_SERVER, port: config.DB_PORT, database: config.DB_DATABASE, user: config.DB_USER, password: config.DB_PASSWORD, options: { encrypt: true, trustServerCertificate: config.DB_TRUST_CERTIFICATE === 'true', abortTransactionOnError: true }, pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }, connectionTimeout: 10000, requestTimeout: 15000 });
pool.on('error', () => logger.error({ event: 'sql_pool_error' }));
export { sql };
