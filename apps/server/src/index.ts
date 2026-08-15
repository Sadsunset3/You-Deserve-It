import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { buildApp } from './app.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectEnvPath = resolve(moduleDir, '../../../.env');
if (existsSync(projectEnvPath)) process.loadEnvFile(projectEnvPath);

const env = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_PATH: z.string().default('./data/game.db'),
  SESSION_SECRET: z.string().min(32).default('development-secret-change-me-123456'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  WECHAT_TOKEN: z.string().default(''),
  WECHAT_APP_ID: z.string().default(''),
  WECHAT_APP_SECRET: z.string().default(''),
  WECHAT_ENCODING_AES_KEY: z.string().default(''),
  WECHAT_TEMPLATE_ID: z.string().default(''),
  WECHAT_MENU_KEY: z.string().default('LOGIN'),
  AGNES_BASE_URL: z.string().default('https://apihub.agnes-ai.com/v1'),
  AGNES_API_KEY: z.string().default('sk-e4NeJjpoVR8foSKxLMIQspKj56tDHdjYn8JXpWx6z0CxjYvP'),
  AGNES_MODEL: z.string().default('agnes-2.0-flash'),
  FREE_TOKEN_TTL_MINUTES: z.coerce.number().default(60),
}).parse(process.env);
const databasePath = resolve(env.DATABASE_PATH); mkdirSync(dirname(databasePath), { recursive: true });
const app = await buildApp({ databasePath, sessionSecret: env.SESSION_SECRET, webOrigin: env.WEB_ORIGIN, webRoot: resolve(moduleDir, '../../web/dist') });
await app.listen({ port: env.PORT, host: '0.0.0.0' });
