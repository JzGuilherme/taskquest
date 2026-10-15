ALTER TABLE dbo.Users ADD password_hash VARCHAR(60) NULL;
ALTER TABLE dbo.Users ADD role VARCHAR(5) NOT NULL CONSTRAINT DF_Users_Role DEFAULT 'Dev';
ALTER TABLE dbo.Users ADD is_active BIT NOT NULL CONSTRAINT DF_Users_Active DEFAULT 0;
ALTER TABLE dbo.Users ADD mfa_enabled BIT NOT NULL CONSTRAINT DF_Users_Mfa DEFAULT 0;
GO
ALTER TABLE dbo.Users ADD CONSTRAINT CK_Users_Role CHECK (role IN ('Admin', 'Dev'));
ALTER TABLE dbo.Users ADD CONSTRAINT CK_Users_ActivePassword CHECK (is_active = 0 OR password_hash IS NOT NULL);
CREATE TABLE dbo.AuthFamilies (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES dbo.Users(id),
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  expires_at DATETIME2(3) NOT NULL,
  revoked_at DATETIME2(3) NULL
);
CREATE TABLE dbo.AuthRefreshTokens (
  token_hash BINARY(32) NOT NULL PRIMARY KEY,
  family_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.AuthFamilies(id) ON DELETE CASCADE,
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  used_at DATETIME2(3) NULL
);
CREATE INDEX IX_AuthFamilies_User ON dbo.AuthFamilies(user_id, expires_at);
CREATE INDEX IX_AuthRefreshTokens_Family ON dbo.AuthRefreshTokens(family_id);
CREATE TABLE dbo.MfaCredentials (
  user_id INT NOT NULL PRIMARY KEY REFERENCES dbo.Users(id),
  secret_ciphertext VARBINARY(512) NOT NULL,
  key_id NVARCHAR(128) NOT NULL,
  confirmed_at DATETIME2(3) NULL,
  last_used_counter BIGINT NULL,
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.MfaRecoveryCodes (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  user_id INT NOT NULL REFERENCES dbo.Users(id),
  code_hash BINARY(32) NOT NULL UNIQUE,
  used_at DATETIME2(3) NULL
);

