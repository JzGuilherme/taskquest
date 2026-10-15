USE master;
GO
CREATE MASTER KEY ENCRYPTION BY PASSWORD = '$(RestoreMasterKeyPassword)';
CREATE CERTIFICATE TaskCorpTdeCertificate FROM FILE = '$(CertificateBackupPath)'
WITH PRIVATE KEY (FILE = '$(PrivateKeyBackupPath)', DECRYPTION BY PASSWORD = '$(CertificateBackupPassword)');
RESTORE DATABASE TaskCorpInsights FROM DISK = '$(FullBackupPath)'
WITH MOVE 'TaskCorpInsights' TO '$(DataPath)', MOVE 'TaskCorpInsights_log' TO '$(LogPath)', NORECOVERY, CHECKSUM;
GO
