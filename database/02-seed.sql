USE TaskCorpInsights;
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;

INSERT INTO dbo.Users (name, email) VALUES
    (N'Ana Souza', N'ana@taskcorp.example'),
    (N'Bruno Lima', N'bruno@taskcorp.example'),
    (N'Carla Santos', N'carla@taskcorp.example');

DECLARE @ana INT = (SELECT id FROM dbo.Users WHERE email = N'ana@taskcorp.example');
DECLARE @bruno INT = (SELECT id FROM dbo.Users WHERE email = N'bruno@taskcorp.example');
DECLARE @carla INT = (SELECT id FROM dbo.Users WHERE email = N'carla@taskcorp.example');

INSERT INTO dbo.Tasks (title, description, status, assigned_to) VALUES
    (N'Criar tela de login', N'Montar formulário e validações.', N'To Do', @ana),
    (N'Implementar API de tarefas', N'Criar rotas e integrar o SQL Server.', N'Doing', @bruno),
    (N'Definir modelo de dados', N'Documentar tabelas e relacionamentos.', N'Done', @carla);

INSERT INTO dbo.FocusSessions (user_id, duration_minutes) VALUES
    (@ana, 50), (@bruno, 90), (@carla, 25);
COMMIT;
GO

