IF EXISTS (SELECT 1 FROM dbo.PasswordResets WHERE used_at IS NULL AND expires_at > SYSUTCDATETIME())
  THROW 51000, 'Aguarde a expiração dos códigos antes do rollback.', 1;
DROP TABLE dbo.PasswordResets;
