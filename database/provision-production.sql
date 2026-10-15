USE master;
GO
CREATE LOGIN [taskcorp_app] WITH PASSWORD = '$(AppDbPassword)', CHECK_POLICY = ON, CHECK_EXPIRATION = ON;
GO
USE TaskCorpInsights;
GO
CREATE USER [taskcorp_app] FOR LOGIN [taskcorp_app];
GRANT SELECT ON dbo.Users TO [taskcorp_app];
GRANT INSERT ON dbo.Users TO [taskcorp_app];
GRANT SELECT, INSERT, UPDATE ON dbo.Tasks TO [taskcorp_app];
GRANT SELECT, INSERT ON dbo.FocusSessions TO [taskcorp_app];
GRANT SELECT, INSERT, UPDATE ON dbo.AuthFamilies TO [taskcorp_app];
GRANT SELECT, INSERT, UPDATE ON dbo.AuthRefreshTokens TO [taskcorp_app];
DENY ALTER, CONTROL, TAKE OWNERSHIP ON DATABASE::TaskCorpInsights TO [taskcorp_app];
GO

GRANT SELECT, INSERT, UPDATE ON dbo.PasswordResets TO taskcorp_app;
GRANT UPDATE (password_hash) ON dbo.Users TO taskcorp_app;
