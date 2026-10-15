USE master;
GO
CREATE MASTER KEY ENCRYPTION BY PASSWORD = '$(MasterKeyPassword)';
CREATE CERTIFICATE TaskCorpTdeCertificate WITH SUBJECT = 'TaskCorp TDE';
BACKUP CERTIFICATE TaskCorpTdeCertificate TO FILE = '$(CertificateBackupPath)'
WITH PRIVATE KEY (FILE = '$(PrivateKeyBackupPath)', ENCRYPTION BY PASSWORD = '$(CertificateBackupPassword)');
GO
USE TaskCorpInsights;
GO
CREATE DATABASE ENCRYPTION KEY WITH ALGORITHM = AES_256 ENCRYPTION BY SERVER CERTIFICATE TaskCorpTdeCertificate;
ALTER DATABASE TaskCorpInsights SET ENCRYPTION ON;
GO
SELECT encryption_state, percent_complete FROM sys.dm_database_encryption_keys WHERE database_id = DB_ID(N'TaskCorpInsights');
GO
