const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');
const env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
async function verify() {
  const password = env.SMTP_PASSWORD_FILE ? fs.readFileSync(path.resolve(__dirname, '..', env.SMTP_PASSWORD_FILE), 'utf8').trim() : env.SMTP_PASSWORD;
  if (!env.SMTP_USER || !password) {
    console.error('Configure SMTP_USER e SMTP_PASSWORD no backend/.env. Use uma senha de app do Gmail.');
    process.exitCode = 1;
    return;
  }
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: env.SMTP_USER, pass: password }, connectionTimeout: 10000, socketTimeout: 15000, logger: false, debug: false });
  try {
    await transport.verify();
    console.log('PASS: conexão TLS e autenticação no Gmail. A entrega do código ainda precisa ser testada pelo formulário de recuperação.');
  } catch (error) {
    const code = ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(error.code) ? error.code : 'SMTP_ERROR';
    console.error('Falha na verificação SMTP: ' + code);
    process.exitCode = 1;
  } finally { transport.close(); }
}
verify().catch(() => { console.error('Não foi possível ler a configuração SMTP.'); process.exitCode = 1; });
