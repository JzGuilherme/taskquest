CREATE TABLE dbo.PasswordResets (
  user_id INT NOT NULL PRIMARY KEY REFERENCES dbo.Users(id),
  code_hash BINARY(32) NOT NULL,
  requested_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  expires_at DATETIME2(3) NOT NULL,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  used_at DATETIME2(3) NULL
);
