IF EXISTS (SELECT 1 FROM dbo.Tasks WHERE deleted_at IS NOT NULL)
  THROW 51000, 'Rollback bloqueado para evitar restaurar tarefas excluídas silenciosamente.', 1;
ALTER TABLE dbo.Tasks DROP COLUMN deleted_at;
