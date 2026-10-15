import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

function secret(name: string): string | undefined {
  const file = process.env[`${name}_FILE`];
  return file ? readFileSync(file, 'utf8').trim() : process.env[name];
}

const environment = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_ORIGIN: z.string().url(),
  DB_SERVER: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(1433),
  DB_DATABASE: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_TRUST_CERTIFICATE: z.enum(['true', 'false']).default('false'),
  JWT_SECRET: z.string().min(48),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  REDIS_URL: z.string().url().optional(),
  TRUST_PROXY: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
}).safeParse({ ...process.env, DB_PASSWORD: secret('DB_PASSWORD'), JWT_SECRET: secret('JWT_SECRET'), REDIS_URL: secret('REDIS_URL'), SMTP_PASSWORD: secret('SMTP_PASSWORD') });

if (!environment.success) throw new Error(`Configuração inválida: ${environment.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
export const config = environment.data;
export const production = config.NODE_ENV === 'production';
if (new URL(config.FRONTEND_ORIGIN).origin !== config.FRONTEND_ORIGIN) throw new Error('FRONTEND_ORIGIN deve conter somente a origem, sem caminho.');
if (production && (!config.FRONTEND_ORIGIN.startsWith('https://') || config.DB_TRUST_CERTIFICATE !== 'false' || !config.REDIS_URL?.startsWith('rediss://') || !config.TRUST_PROXY)) {
  throw new Error('Produção exige HTTPS, certificado SQL válido, Redis e proxy confiável explicitamente configurado.');
}

