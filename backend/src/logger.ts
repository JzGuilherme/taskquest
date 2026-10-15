import pino from 'pino';
import { config } from './config';
export const logger = pino({ level: config.LOG_LEVEL, base: { service: 'taskcorp-api' }, redact: { paths: ['password', 'email', 'token', 'accessToken', 'refreshToken', 'req.headers.authorization', 'req.headers.cookie', 'req.body', 'res.headers["set-cookie"]', '*.password', '*.email', '*.secret'], censor: '[REDACTED]' } });
