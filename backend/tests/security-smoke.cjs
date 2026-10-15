const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const sql = require('mssql');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const appEnv = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env')));
const adminEnv = dotenv.parse(fs.readFileSync(path.join(__dirname, '../../database/.env')));
const adminPassword = `Admin!${randomBytes(20).toString('hex')}`;
const devPassword = `Dev!${randomBytes(20).toString('hex')}`;
const base = 'http://127.0.0.1:3101';
const origin = 'http://127.0.0.1:4201';
const env = { ...process.env, ...appEnv, NODE_ENV: 'test', PORT: '3101', DB_DATABASE: 'TaskCorpSecurityAudit', FRONTEND_ORIGIN: origin, JWT_SECRET: randomBytes(48).toString('hex'), TRUST_PROXY: '' };
let server;
let management;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, method = 'GET', body, token, cookie, requestOrigin = origin) {
  return fetch(`${base}/api${route}`, { method, headers: { Origin: requestOrigin, 'X-Taskcorp-Client': 'web', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
async function login(email, password) {
  const response = await request('/auth/login', 'POST', { email, password });
  assert.equal(response.status, 200);
  return { ...(await response.json()), cookie: response.headers.get('set-cookie').split(';')[0] };
}
async function run() {
  management = await new sql.ConnectionPool({ server: appEnv.DB_SERVER, port: Number(appEnv.DB_PORT), database: 'master', user: 'sa', password: adminEnv.MSSQL_SA_PASSWORD, options: { encrypt: true, trustServerCertificate: true } }).connect();
  await management.request().query("IF DB_ID(N'TaskCorpSecurityAudit') IS NULL CREATE DATABASE TaskCorpSecurityAudit;");
  const cliEnv = { ...env, MIGRATION_DB_USER: 'sa', MIGRATION_DB_PASSWORD: adminEnv.MSSQL_SA_PASSWORD, ADMIN_NAME: 'Admin Teste', ADMIN_EMAIL: 'admin@security.example', ADMIN_PASSWORD: adminPassword };
  for (const cli of ['migrate', 'bootstrap-admin']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', `src/cli/${cli}.ts`], { cwd: path.join(__dirname, '..'), env: cliEnv, encoding: 'utf8' });
    assert.equal(result.status, 0, `CLI ${cli} falhou.`);
  }
  await management.request().query(`USE TaskCorpSecurityAudit;
    CREATE USER taskcorp_app FOR LOGIN taskcorp_app;
    GRANT SELECT, INSERT ON dbo.Users TO taskcorp_app;
    GRANT SELECT, INSERT, UPDATE ON dbo.Tasks TO taskcorp_app;
    GRANT SELECT, INSERT ON dbo.FocusSessions TO taskcorp_app;
    GRANT SELECT, INSERT, UPDATE ON dbo.AuthFamilies TO taskcorp_app;
    GRANT SELECT, INSERT, UPDATE ON dbo.AuthRefreshTokens TO taskcorp_app;`);
  server = spawn(process.execPath, ['dist/server.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'ignore', 'ignore'] });
  let ready = false;
  for (let i = 0; i < 40; i++) { try { ready = (await fetch(`${base}/health/ready`)).ok; } catch {} if (ready) break; await delay(500); }
  assert.ok(ready, 'API de teste indisponível.');
  assert.equal((await request('/users')).status, 401);
  assert.equal((await request('/users', 'GET', undefined, undefined, undefined, 'https://evil.example')).status, 403);
  const admin = await login('admin@security.example', adminPassword);
  const jwtBody = JSON.parse(Buffer.from(admin.accessToken.split('.')[1], 'base64url').toString());
  assert.equal(jwtBody.exp - jwtBody.iat, 600);
  assert.equal((await request('/users', 'POST', { name: 'Dev', email: 'invalid', password: devPassword }, admin.accessToken)).status, 400);
  assert.equal((await request('/users', 'POST', { name: 'Dev', email: 'dev@security.example', password: 'short' }, admin.accessToken)).status, 400);
  const created = await request('/users', 'POST', { name: 'Dev', email: 'dev@security.example', password: devPassword }, admin.accessToken);
  assert.equal(created.status, 201);
  const devUser = await created.json();
  const stored = await management.request().input('id', sql.Int, devUser.id).query('USE TaskCorpSecurityAudit; SELECT password_hash FROM dbo.Users WHERE id = @id');
  assert.ok(await bcrypt.compare(devPassword, stored.recordset[0].password_hash));
  assert.notEqual(stored.recordset[0].password_hash, devPassword);
  const dev = await login('dev@security.example', devPassword);
  assert.equal((await request('/users', 'POST', { name: 'Forbidden', email: 'forbidden@security.example', password: devPassword }, dev.accessToken)).status, 403);
  assert.equal((await request('/focus', 'POST', { user_id: admin.user.id, duration_minutes: 30 }, dev.accessToken)).status, 403);
  const injection = "'; DROP TABLE dbo.Users;--";
  const taskResponse = await request('/tasks', 'POST', { title: injection, assigned_to: dev.user.id }, dev.accessToken);
  assert.equal(taskResponse.status, 201);
  assert.equal((await taskResponse.json()).title, injection);
  assert.equal((await request('/users', 'GET', undefined, admin.accessToken)).status, 200);
  assert.equal((await request('/focus', 'POST', { user_id: dev.user.id, duration_minutes: 37 }, dev.accessToken)).status, 201);
  const history = await (await request('/focus', 'GET', undefined, dev.accessToken)).json();
  assert.equal(history.length, 1);
  assert.equal(history[0].user_id, dev.user.id);
  const refreshed = await request('/auth/refresh', 'POST', {}, undefined, dev.cookie);
  assert.equal(refreshed.status, 200);
  const rotated = await refreshed.json();
  assert.notEqual(refreshed.headers.get('set-cookie').split(';')[0], dev.cookie);
  assert.equal((await request('/auth/refresh', 'POST', {}, undefined, dev.cookie)).status, 401);
  assert.equal((await request('/users', 'GET', undefined, rotated.accessToken)).status, 401);
  assert.equal((await request('/auth/logout', 'POST', {}, undefined, admin.cookie)).status, 204);
  assert.equal((await request('/users', 'GET', undefined, admin.accessToken)).status, 401);
  await management.request().input('id', sql.Int, dev.user.id).query('USE TaskCorpSecurityAudit; UPDATE dbo.Users SET mfa_enabled = 1 WHERE id = @id');
  assert.equal((await request('/auth/login', 'POST', { email: 'dev@security.example', password: devPassword })).status, 403);
  let limited = false;
  for (let i = 0; i < 12; i++) { const response = await request('/auth/login', 'POST', { email: 'missing@security.example', password: devPassword }); if (response.status === 429) { limited = true; break; } }
  assert.ok(limited);
  const rollback = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/migrate.ts', '--rollback'], { cwd: path.join(__dirname, '..'), env: { ...cliEnv, ROLLBACK_BACKUP_REFERENCE: 'isolated-audit-database' }, encoding: 'utf8' });
  assert.notEqual(rollback.status, 0);
  fs.writeFileSync(path.join(__dirname, '../security-test-result.json'), JSON.stringify({ result: 'PASS', database: 'TaskCorpSecurityAudit', checks: ['401 sem sessão', 'CORS', 'validação', 'bcrypt', 'RBAC', 'SQL injection parametrizada', 'JWT 10 minutos', 'refresh rotativo', 'reuso revoga família', 'logout revoga acesso', 'MFA bloqueia login', 'rate limit 429', 'rollback bloqueia perda de credenciais'], verifiedAt: new Date().toISOString() }, null, 2));
  console.log('PASS: controles de segurança validados em banco isolado.');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { server?.kill('SIGTERM'); if (management) await management.close(); });

