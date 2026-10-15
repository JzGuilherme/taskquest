IF EXISTS (SELECT 1 FROM dbo.Users WHERE password_hash IS NOT NULL OR mfa_enabled = 1)
  OR EXISTS (SELECT 1 FROM dbo.AuthFamilies)
  OR EXISTS (SELECT 1 FROM dbo.MfaCredentials)
  OR EXISTS (SELECT 1 FROM dbo.MfaRecoveryCodes)
  THROW 51000, 'Rollback bloqueado: existem credenciais ou sessões. Faça roll-forward ou restauração aprovada.', 1;
DROP TABLE dbo.MfaRecoveryCodes;
DROP TABLE dbo.MfaCredentials;
DROP TABLE dbo.AuthRefreshTokens;
DROP TABLE dbo.AuthFamilies;
ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_ActivePassword, CK_Users_Role, DF_Users_Mfa, DF_Users_Active, DF_Users_Role;
ALTER TABLE dbo.Users DROP COLUMN mfa_enabled, is_active, role, password_hash;
