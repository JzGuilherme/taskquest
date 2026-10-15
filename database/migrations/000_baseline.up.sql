IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Users (id INT IDENTITY PRIMARY KEY, name NVARCHAR(100) NOT NULL, email NVARCHAR(254) NOT NULL UNIQUE);
  CREATE TABLE dbo.Tasks (id INT IDENTITY PRIMARY KEY, title NVARCHAR(200) NOT NULL, description NVARCHAR(2000) NULL, status NVARCHAR(10) NOT NULL DEFAULT N'To Do', assigned_to INT NOT NULL REFERENCES dbo.Users(id), created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(), CONSTRAINT CK_Tasks_Status CHECK (status IN (N'To Do', N'Doing', N'Done')));
  CREATE TABLE dbo.FocusSessions (id INT IDENTITY PRIMARY KEY, user_id INT NOT NULL REFERENCES dbo.Users(id), duration_minutes INT NOT NULL, logged_date DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(), CONSTRAINT CK_FocusSessions_Duration CHECK (duration_minutes BETWEEN 1 AND 1440));
  CREATE INDEX IX_Tasks_AssignedTo ON dbo.Tasks(assigned_to);
  CREATE INDEX IX_FocusSessions_UserDate ON dbo.FocusSessions(user_id, logged_date);
END;
IF OBJECT_ID(N'dbo.Tasks', N'U') IS NULL OR OBJECT_ID(N'dbo.FocusSessions', N'U') IS NULL
  THROW 51000, 'Schema inicial incompleto. Restaure ou corrija antes de migrar.', 1;
