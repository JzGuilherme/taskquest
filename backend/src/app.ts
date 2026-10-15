import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { config, production } from './config';
import { logger } from './logger';
import { pool, sql } from './db';
import { checkOrigin, limiter, redis, requireTls } from './security';
import { authRoutes } from './auth';
import { apiRoutes } from './routes';
import { asyncRoute } from './http';

export const app = express();
app.disable('x-powered-by');
if (config.TRUST_PROXY) app.set('trust proxy', config.TRUST_PROXY.split(',').map(value => value.trim()));
app.use(pinoHttp({ logger, genReqId: () => randomUUID(), serializers: { req: req => ({ id: req.id, method: req.method }), res: res => ({ statusCode: res.statusCode }), err: () => ({ message: 'request_failed' }) } }));
app.use(helmet({ strictTransportSecurity: production ? { maxAge: 31536000, includeSubDomains: true } : false }));
app.get('/health/live', (_req, res) => { res.json({ status: 'ok' }); });
app.get('/health/ready', asyncRoute(async (_req, res) => { await pool.request().query('SELECT 1 AS ok'); if (redis && !redis.isReady) { res.status(503).json({ status: 'unavailable' }); return; } res.json({ status: 'ok' }); }));
app.use(requireTls, checkOrigin);
app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Taskcorp-Client'] }));
app.use(limiter('taskcorp:api:', 300, 60000));
app.use(express.json({ limit: '16kb', strict: true }));
app.use(cookieParser());
app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use((_req, res) => { res.status(404).json({ message: 'Rota não encontrada.' }); });
const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  if (error instanceof sql.RequestError && [2601, 2627].includes(error.number ?? 0)) { res.status(409).json({ message: 'Registro já cadastrado.' }); return; }
  if (error instanceof sql.RequestError && error.number === 547) { res.status(400).json({ message: 'Relacionamento ou dados inválidos.' }); return; }
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') { res.status(400).json({ message: 'JSON inválido.' }); return; }
    if (error.type === 'entity.too.large') { res.status(413).json({ message: 'Requisição muito grande.' }); return; }
  }
  logger.error({ event: 'request_failed', requestId: req.id });
  res.status(500).json({ message: 'Não foi possível concluir a operação.', requestId: req.id });
};
app.use(errorHandler);

