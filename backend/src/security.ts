import { type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import { config, production } from './config';
import { logger } from './logger';
export const redis = config.REDIS_URL ? createClient({ url: config.REDIS_URL }) : undefined;
redis?.on('error', () => logger.error({ event: 'redis_connection_error' }));
export function limiter(prefix: string, limit: number, windowMs: number): RequestHandler {
  return rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, passOnStoreError: false, store: redis ? new RedisStore({ prefix, sendCommand: (...args: string[]) => redis.sendCommand(args) }) : undefined, message: { message: 'Muitas requisições. Aguarde e tente novamente.' } });
}
export const requireTls: RequestHandler = (req, res, next) => {
  if (production && !req.secure) { res.status(426).json({ message: 'HTTPS obrigatório.' }); return; }
  next();
};
export const checkOrigin: RequestHandler = (req, res, next) => {
  if (req.get('origin') && req.get('origin') !== config.FRONTEND_ORIGIN) { res.status(403).json({ message: 'Origem não permitida.' }); return; }
  next();
};
export const sessionOrigin: RequestHandler = (req, res, next) => {
  if (req.get('origin') !== config.FRONTEND_ORIGIN || req.get('x-taskcorp-client') !== 'web') { res.status(403).json({ message: 'Origem de sessão inválida.' }); return; }
  next();
};
