IF NOT EXISTS (SELECT 1 FROM sys.dm_database_encryption_keys WHERE database_id = DB_ID(N'TaskCorpInsights') AND encryption_state = 3)
  THROW 51000, 'TDE não está ativo e concluído.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'TaskCorpInsights' AND recovery_model_desc = 'FULL')
  THROW 51000, 'O banco deve estar em FULL recovery.', 1;
GO
