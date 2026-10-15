const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const sql = require('mssql');
const env = require('dotenv').parse(fs.readFileSync('.env'));
const base = 'http://127.0.0.1:4201/api';
async function request(route, method = 'GET', body, token) {
  return fetch(base + route, { method, headers: { Origin: 'http://127.0.0.1:4201', 'X-Taskcorp-Client': 'web', 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
async function account() {
  const email = `delete-test-${randomBytes(6).toString('hex')}@example.test`;
  const password = randomBytes(24).toString('base64url');
  assert.equal((await request('/auth/register', 'POST', { name: 'Teste Exclusão', email, password })).status, 201);
  const login = await request('/auth/login', 'POST', { email, password });
  assert.equal(login.status, 200);
  return login.json();
}
async function run() {
  const owner = await account();
  const other = await account();
  const created = await request('/tasks', 'POST', { title: 'Tarefa temporária de teste de exclusão', assigned_to: owner.user.id }, owner.accessToken);
  assert.equal(created.status, 201);
  const task = await created.json();
  assert.equal((await request('/tasks/' + task.id, 'DELETE')).status, 401);
  assert.equal((await request('/tasks/invalid', 'DELETE', undefined, owner.accessToken)).status, 400);
  assert.equal((await request('/tasks/' + task.id, 'DELETE', undefined, other.accessToken)).status, 404);
  assert.equal((await request('/tasks/' + task.id, 'DELETE', undefined, owner.accessToken)).status, 204);
  const tasks = await (await request('/tasks', 'GET', undefined, owner.accessToken)).json();
  assert.ok(!tasks.some(item => item.id === task.id));
  assert.equal((await request('/tasks/' + task.id + '/status', 'PATCH', { status: 'Doing' }, owner.accessToken)).status, 404);
  assert.equal((await request('/tasks/' + task.id, 'DELETE', undefined, owner.accessToken)).status, 404);
  const db = await new sql.ConnectionPool({ server: env.DB_SERVER, port: Number(env.DB_PORT), database: env.DB_DATABASE, user: env.DB_USER, password: env.DB_PASSWORD, options: { encrypt: true, trustServerCertificate: true } }).connect();
  try {
    const stored = (await db.request().input('id', sql.Int, task.id).query('SELECT deleted_at FROM dbo.Tasks WHERE id = @id')).recordset[0];
    assert.ok(stored.deleted_at);
  } finally { await db.close(); }
  console.log('PASS: exclusão lógica persistida, tarefa removida da listagem, autenticação, autorização, validação de ID e bloqueio de tarefa já excluída.');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
