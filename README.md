# TaskCorp Insights

Angular standalone, Express/TypeScript e SQL Server, com autenticação e autorização.

Consulte [SECURITY-OPERATIONS.md](SECURITY-OPERATIONS.md) para configuração, migrations, bootstrap do administrador, TLS, RBAC, backups e recuperação.

Execute `npm ci` em backend e frontend. Configure backend/.env a partir do exemplo, forneça credenciais de migrations separadas e execute `npm run migrate` e `npm run bootstrap-admin` no backend. Contas antigas são preservadas e ficam inativas até receberem senha por um fluxo administrativo controlado.

Para desenvolvimento, execute `npm run start:local` no backend e `npm start` no frontend. A interface usa http://127.0.0.1:4201 e encaminha /api para a API local. Configure FRONTEND_ORIGIN com essa origem exata.

Validação: backend `npm test`, ambos `npm run build` e `npm run audit:security`. O teste integrado backend/tests/security-smoke.cjs usa um banco isolado dedicado e requer credenciais locais de administração; não faz parte do deploy.

Os arquivos de produção são modelos a configurar com domínio, certificados e segredos reais. Não execute o ambiente de demonstração como produção.
