# Segurança e operação do TaskCorp Insights

## Resultado da auditoria e arquitetura

A versão anterior tinha rotas públicas, CORS amplo, ausência de senha/sessão e provisionamento local com interpolação de senha em SQL. As rotas foram movidas para `/api`, protegidas por JWT e autorização no servidor. O Angular usa `/api` na mesma origem, proxy no desenvolvimento e Nginx em produção.

As queries de aplicação usam `.input()` com tipos `mssql`; parâmetros são enviados separadamente do texto SQL. Nenhuma entrada do usuário é concatenada em queries. SQL estático de migrations é lido de arquivos versionados, com checksum, e não de requisições. O provisionador antigo foi desativado.

Zod valida objetos estritos, tipos, limites, IDs, e-mails e status. Nome/e-mail recebem trim, e-mail é normalizado em minúsculas; senhas não são alteradas. O Angular renderiza texto por interpolação, sem `innerHTML`. Sanitização não substitui autorização nem parametrização.

## Autenticação e RBAC

| Operação | Admin | Dev |
| --- | --- | --- |
| Criar usuário e definir perfil | Sim | Não |
| Listar nomes do time | Sim | Sim |
| Consultar e-mails do time | Sim | Não |
| Consultar quadro de tarefas | Sim | Sim |
| Criar ou atualizar tarefas | Todas | Apenas atribuídas a si |
| Registrar foco | Qualquer usuário | Apenas próprio |
| Consultar histórico de foco | Todo o time | Apenas próprio |

Senhas usam bcrypt com custo 12, mínimo 12 caracteres e máximo 72 bytes UTF-8, evitando truncamento silencioso. Calibre o custo em hardware de produção. A API nunca retorna hashes. Não há cadastro público.

JWT HS256 expira em 10 minutos, valida algoritmo, emissor e audiência. O segredo deve ser aleatório com pelo menos 48 caracteres; prefira 48 bytes aleatórios codificados. Access token fica apenas na memória do Angular, nunca em localStorage. Cada chamada protegida verifica a família da sessão e o usuário no SQL Server, permitindo revogação imediata e perfil atualizado.

Refresh tokens têm 48 bytes aleatórios, validade absoluta de 7 dias e são armazenados somente como SHA-256 no SQL Server. O cookie de produção é `__Secure-taskcorp-refresh`, HttpOnly, Secure, SameSite=Strict e restrito a `/api/auth`. Cada refresh consome o token anterior e emite outro dentro de transação SERIALIZABLE com locks. Reutilizar um token já consumido revoga toda a família, inclusive access tokens. Requisições de refresh concorrentes em abas diferentes podem exigir novo login por esse comportamento conservador.

Login, refresh e logout exigem a origem exata do frontend e o cabeçalho `X-Taskcorp-Client: web`. CORS aceita uma única origem configurada; cookies ficam na mesma origem via proxy. O interceptor do Angular coordena refresh concorrente dentro da mesma aba. Logout revoga a família no servidor e remove o cookie.

As contas antigas permanecem no banco com `is_active=0` e sem senha. Não atribua uma senha coletiva. O bootstrap cria ou ativa um único administrador, e recusa execução quando já existe um administrador ativo. Para ativar contas antigas, faça um fluxo administrativo de definição de senha individual ou implemente convite com token de uso único antes do rollout para esses usuários. Recuperação de senha e convites não estão implementados.

## MFA: estrutura futura, sem alegar proteção ativa

`MfaCredentials` contém ciphertext, identificador de chave, confirmação e último contador usado. `MfaRecoveryCodes` contém hashes de códigos de recuperação e marca de uso. Nenhum segredo TOTP deve ser armazenado em texto puro.

A integração futura deve exigir sessão recente e confirmação de senha para inscrição; gerar segredo com CSPRNG; proteger com envelope encryption AES-256-GCM via KMS, AAD contendo ID do usuário e versão, nonce único; exibir QR uma única vez; confirmar um TOTP antes de habilitar; armazenar códigos de recuperação apenas como hash; impedir repetição de contador; limitar tentativas por conta e IP; consumir o desafio e emitir JWT/refresh apenas após o segundo fator. Recuperação e desativação de MFA exigem autenticação forte e auditoria.

Atualmente `mfa_enabled=1` bloqueia login, refresh e access token. Não habilite a flag enquanto a verificação completa não estiver implementada. Essas tabelas são infraestrutura futura, não uma implementação funcional de MFA.

## Configuração e segredos

Use `backend/.env.production.example` como referência. Em produção, DB_PASSWORD_FILE, JWT_SECRET_FILE e REDIS_URL_FILE apontam para arquivos montados pelo secret manager. Não coloque credenciais em imagens, build args, git, logs ou URLs de navegador. Docker Compose secrets em modo local são arquivos montados, não um cofre criptografado: use permissões restritas e um secret manager real no ambiente.

Use credenciais distintas para runtime, migrations e backup. Não forneça MIGRATION_DB_PASSWORD nem ADMIN_PASSWORD ao container da API. JWT pode ser rotacionado revogando as sessões existentes; uma rotação sem interrupção requer futura estratégia de múltiplas chaves/kid. Rotacione senha SQL e certificado com sobreposição controlada e teste de conexão.

A API recusa produção sem HTTPS no FRONTEND_ORIGIN, verificação de certificado SQL, Redis e proxy explicitamente confiável. Configure o Redis gerenciado com TLS, ACL e rede privada. `.env` é somente desenvolvimento; os exemplos não contêm segredos utilizáveis.

## TLS, proxy e limitações de DDoS

`deploy/nginx.conf` redireciona HTTP para um domínio fixo HTTPS, usa TLS 1.2/1.3, HSTS e headers defensivos. Substitua `taskcorp.example.com` no Nginx e no env pelo domínio real. Monte certificado e chave válidos, renove automaticamente e alerte antes de expirar. O certificado SQL também deve validar a cadeia e o nome de DB_SERVER; não use trustServerCertificate em produção.

O proxy sobrescreve X-Forwarded-For e X-Forwarded-Proto; configure TRUST_PROXY apenas com seu IP/CIDR. A porta 3000 não deve ser publicada. Nunca use trust proxy=true ou confie em headers de clientes externos. A API rejeita HTTP em produção; o redirecionamento ocorre no proxy para não reconstruir URLs com Host controlado pelo cliente.

express-rate-limit usa Redis compartilhado em produção: 300 requisições/minuto por IP; login 10/15 minutos; refresh 60/15 minutos. Falha no Redis não libera requisições. No ambiente local/teste usa memória. Nginx adiciona limites de corpo, conexão e frequência. Esses controles não impedem DDoS volumétrico: use CDN/WAF/proteção do provedor, firewall e limites de custo. Ajuste limites ao tráfego real e monitore IPs compartilhados/NAT.

## Migrations e rollout

1. Faça backup verificável e registre o identificador do backup.
2. Teste as migrations em uma cópia restaurada do banco.
3. Configure MIGRATION_DB_USER e MIGRATION_DB_PASSWORD_FILE para um principal administrativo temporário.
4. Na pasta backend execute `npm run migrate`. O runner usa lock de aplicação, transação SQL, checksum e tabela SchemaMigrations. Falha de execução reverte a transação.
5. Em banco novo, crie previamente TaskCorpInsights e execute as migrations. Não rode seeds fictícios em produção.
6. Execute o script de menor privilégio com um DBA. Para login já existente, aplique apenas os GRANTs necessários após verificar o estado atual.
7. Configure ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD_FILE e execute `npm run bootstrap-admin` uma única vez. Remova essas variáveis/arquivos do ambiente de execução após entregar a senha por canal seguro.
8. Implante API e frontend juntos; as rotas antigas sem `/api` deixam de existir. Verifique health/ready, login, RBAC, refresh, foco e F5.

`npm run rollback` exige ROLLBACK_BACKUP_REFERENCE e só reverte a última migration. O rollback de autenticação se recusa a apagar hashes, sessões ou MFA existentes; nesse caso faça roll-forward ou restaure um backup aprovado. Nunca altere o conteúdo de migrations já aplicadas. Não faça rollback para a antiga API pública como estratégia de incidente.

Os scripts SQL com variáveis SQLCMD devem receber valores de um processo administrativo controlado. Use senhas geradas em base64url, sem aspas simples, e caminhos previamente validados; não aceite esses valores de requisições HTTP. Não passe senhas na linha de comando nem execute sqlcmd com eco de comandos. Use uma sessão SQL autenticada/secret store apropriada ao ambiente.

## Criptografia em repouso e menor privilégio

`database/enable-tde.sql` configura AES-256 no SQL Server e exporta certificado/chave privada protegida por senha ANTES de ativar TDE. Execute com DBA apenas após provisionar destinos de backup seguros. Se master já tem uma master key, reutilize a chave existente de acordo com a política de DBA em vez de executar CREATE novamente. Confirme encryption_state=3 e uma restauração de teste antes de declarar o controle ativo.

TDE protege arquivos de dados e backups, incluindo os e-mails e nomes armazenados. Não impede SELECT autorizado nem leitura por DBA; não equivale a criptografia ponta a ponta. Para esse modelo de ameaça, avalie Always Encrypted/envelope encryption com chave fora do SQL Server. Separe as cópias do certificado/chave privada dos backups do banco e mantenha uma cópia em cofre externo: perder o certificado impede restaurar o banco.

`database/provision-production.sql` concede apenas SELECT/INSERT nas tabelas necessárias e UPDATE onde a API precisa, sem ALTER/CONTROL, db_owner ou sysadmin. O runtime não lê tabelas de MFA nem executa DDL. Migrations, limpeza de sessões expiradas, backup e TDE usam identidades separadas. Use o script cleanup-sessions em job administrativo diário.

O container Developer atual é exclusivamente desenvolvimento/teste; não o utilize para produção comercial. Escolha uma edição/licença SQL Server apropriada ou serviço gerenciado e valide disponibilidade de TDE, backup e alta disponibilidade.

## Logs, monitoração e alertas

Pino emite JSON em stdout. Requisições são registradas por ID gerado no servidor, método, status e duração; não registra corpo, parâmetros, cookies, JWT, senha ou SQL. Redaction adicional cobre nomes comuns de segredos. Erros ao cliente são genéricos com requestId; eventos de login, falhas e reutilização de refresh permitem alertas sem incluir e-mail. Restrinja o acesso aos logs, criptografe o armazenamento e defina retenção de acordo com a finalidade e a política de privacidade.

Monitore `/health/live` e `/health/ready` internamente a cada 30 segundos e a página pública externamente a cada minuto. Alerta após 3 falhas; 5xx acima de 1% por 5 minutos; p95 acima de 1 segundo por 10 minutos; aumento de 401/429; qualquer refresh_reuse_detected; Redis indisponível; saturação do pool SQL; CPU/disco e espaço livre abaixo de 20%; certificado com menos de 21 dias; backup atrasado. Encaminhe para o canal de plantão e registre a resolução. Os thresholds são pontos de partida, não SLOs já medidos.

Health checks e logs estão implementados. Integração com provedor de monitoramento, alertas externos e escalas de plantão dependem da sua infraestrutura e não foram ativados automaticamente.

## Backups e recuperação

Meta inicial a validar: RPO 15 minutos e RTO 2 horas. SQL Server em FULL recovery; backup completo diário, diferencial a cada 6 horas e transaction log a cada 15 minutos. Use os scripts backup-full, backup-differential e backup-log em SQL Server Agent/serviço gerenciado. Cada execução precisa de caminho único com timestamp. Grave primeiro em destino dedicado, verifique CHECKSUM/RESTORE VERIFYONLY e replique para armazenamento fora do servidor com criptografia, retenção e imutabilidade. Não mantenha a única cópia no volume Docker.

Mantenha 35 dias de backups operacionais e retenção mensal conforme a política aprovada. Retenção de backups também precisa considerar pedidos de exclusão e limitações legais: TDE não garante conformidade LGPD/GDPR por si só. Faça restauração completa em ambiente isolado mensalmente; VERIFYONLY sozinho não prova recuperação da aplicação.

Em desastre: isole o incidente; provisione host/rede limpa; recupere segredos e certificado TDE do cofre; restaure o certificado e o backup completo com NORECOVERY; aplique diferencial e todos os logs em ordem até o ponto aprovado; finalize WITH RECOVERY; execute DBCC CHECKDB; recrie/mapeie login da API; valide permissões; implante a versão de aplicação compatível com SchemaMigrations; rotacione segredos/sessões se houver comprometimento; teste login, RBAC e CRUD; direcione o tráfego; monitore e registre RPO/RTO obtidos. Os scripts restore-* fornecem a sequência, sem WITH REPLACE para evitar sobrescrever acidentalmente um banco existente.

## Escalabilidade e CI

API sem sessão local, refresh compartilhado no SQL Server e limites compartilhados no Redis permitem múltiplas réplicas. Cada réplica abre no máximo 10 conexões SQL; dimensione o total de réplicas conforme a capacidade do banco. Dockerfiles usam execução não-root e o Compose restringe filesystem/capabilities. Para alta disponibilidade, utilize orquestrador, balanceador, Redis e SQL Server com failover; Compose em um único host não oferece HA.

As listagens do MVP ainda retornam o conjunto visível completo. Antes de grandes volumes, implemente paginação/cursor e agregação/filtros no servidor; os filtros atuais de histórico operam no frontend sobre registros autorizados. Não considere a versão pronta para dados ilimitados.

A CI faz npm ci, build, testes de validação e npm audit com falha para alertas altos/críticos. O workflow agendado revisa novas vulnerabilidades semanalmente; Dependabot propõe atualizações. Revise lockfiles, use imagens por digest na promoção e faça scan de imagens no registry. Uma auditoria sem alertas não prova ausência de vulnerabilidades.

## Referências

[Express: produção e segurança](https://expressjs.com/en/advanced/best-practice-security/), [OWASP: sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP: armazenamento de senhas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [SQL Server TDE](https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/transparent-data-encryption), [backup criptografado](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/backup-encryption).

## Recuperação de senha pelo Gmail

Configure SMTP_USER com o endereço Gmail remetente e SMTP_PASSWORD com uma senha de app em backend/.env, ou SMTP_PASSWORD_FILE via cofre. Não use a senha normal da conta. O envio usa smtp.gmail.com:465 com TLS validado. Sem credenciais, a API retorna 503 e a interface informa que o serviço não está configurado.

A migration 002 adiciona PasswordResets. Conceda SELECT, INSERT, UPDATE nessa tabela e UPDATE apenas na coluna Users.password_hash ao usuário da API, além das permissões de sessão existentes. Códigos têm 8 dígitos aleatórios, HMAC no banco, validade de 10 minutos, no máximo 5 tentativas e intervalo de 10 minutos entre emissões por conta. A troca invalida todas as sessões e não desativa MFA.

O envio começa após a resposta genérica para evitar revelar a existência da conta pelo tempo SMTP. Nesta versão, não há fila durável: uma interrupção do processo pode impedir a entrega, e o usuário deve solicitar novamente após 10 minutos. Antes de escalar produção, implemente outbox com worker e retries. Erros de entrega geram eventos sem código, senha ou e-mail.

O teste tests/registration-login.cjs usa exclusivamente TaskCorpSecurityAudit, deixa um usuário fictício por execução e verifica cadastro, duplicidade, bcrypt, login, refresh e logout. Ele pressupõe que as migrations de autenticação já estejam aplicadas nesse banco de testes e que SMTP não esteja configurado.
