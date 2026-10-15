const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const sql = require('mssql');
const bcrypt = require('bcrypt');
const local = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
const env = { ...process.env, ...local, NODE_ENV: 'test', DB_DATABASE: local.DB_DATABASE, PORT: '3102', FRONTEND_ORIGIN: 'http://127.0.0.1:4201', JWT_SECRET: randomBytes(48).toString('hex') };
const email = `registration-${randomBytes(8).toString('hex')}@example.test`;
const password = randomBytes(24).toString('base64url');
const base = 'http://127.0.0.1:4201';
let server;
let db;
async function request(route, body, token, cookie) {
  return fetch(base + '/api' + route, { method: body ? 'POST' : 'GET', headers: { Origin: env.FRONTEND_ORIGIN, 'X-Taskcorp-Client': 'web', 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
async function run() {
  assert.equal(env.DB_DATABASE, 'TaskCorpInsights');
  let ready = false;
  for (let i = 0; i < 30; i++) { try { ready = (await fetch(base + '/api/users')).status === 401; } catch {} if (ready) break; await new Promise(resolve => setTimeout(resolve, 500)); }
  assert.ok(ready, 'API de teste indisponível');
  const body = { name: 'Teste Cadastro', email, password };
  assert.equal((await request('/auth/register', { ...body, role: 'Admin' })).status, 400);
  assert.equal((await request('/auth/register', body)).status, 201);
  assert.equal((await request('/auth/register', body)).status, 409);
  assert.equal((await request('/auth/login', { email, password: 'senha-incorreta' })).status, 401);
  const logged = await request('/auth/login', { email, password });
  assert.equal(logged.status, 200);
  const session = await logged.json();
  assert.equal(session.user.role, 'Dev');
  const cookie = logged.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/users', undefined, session.accessToken)).status, 200);
  const restored = await request('/auth/refresh', {}, undefined, cookie);
  assert.equal(restored.status, 200);
  const restoredSession = await restored.json();
  assert.equal(restoredSession.user.id, session.user.id);
  db = await new sql.ConnectionPool({ server: env.DB_SERVER, port: Number(env.DB_PORT), database: env.DB_DATABASE, user: env.DB_USER, password: env.DB_PASSWORD, options: { encrypt: true, trustServerCertificate: true } }).connect();
  const stored = (await db.request().input('email', sql.NVarChar(254), email).query('SELECT password_hash, role FROM dbo.Users WHERE email = @email')).recordset[0];
  assert.equal(stored.role, 'Dev');
  assert.ok(await bcrypt.compare(password, stored.password_hash));
  const nextCookie = restored.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/auth/logout', {}, undefined, nextCookie)).status, 204);
  assert.equal((await request('/users', undefined, restoredSession.accessToken)).status, 401);
  fs.writeFileSync(path.join(__dirname, '../local-auth-test-result.json'), JSON.stringify({ passed: true, testUser: email, database: env.DB_DATABASE, proxy: base, checks: ['registration', 'bcrypt', 'duplicate', 'role', 'login', 'wrong-password', 'refresh', 'logout'] }, null, 2));
  console.log('PASS: cadastro SQL, bcrypt, duplicidade, perfil Dev, login, senha incorreta, restauração, logout.');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { server?.kill(); await db?.close(); });

