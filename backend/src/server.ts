import { app } from './app';
import { pool } from './db';
import { config } from './config';
import { logger } from './logger';
import { redis } from './security';

async function start(): Promise<void> {
  await pool.connect();
  await pool.request().query('SELECT TOP (0) password_hash, role, is_active, mfa_enabled FROM dbo.Users; SELECT TOP (0) id FROM dbo.AuthFamilies;');
  if (redis) await redis.connect();
  const server = app.listen(config.PORT, '0.0.0.0', () => logger.info({ event: 'api_started', port: config.PORT }));
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on('error', () => { logger.fatal({ event: 'listen_failed' }); process.exit(1); });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 15000);
    timeout.unref();
    server.close(() => {
      Promise.all([pool.close(), redis?.quit()]).then(() => { clearTimeout(timeout); process.exit(0); }).catch(() => process.exit(1));
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
void start().catch(() => { logger.fatal({ event: 'startup_failed', message: 'Verifique configuração, migrations, banco e Redis.' }); process.exit(1); });
