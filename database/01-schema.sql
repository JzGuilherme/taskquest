IF DB_ID(N'TaskCorpInsights') IS NULL
    EXEC(N'CREATE DATABASE TaskCorpInsights');
GO
USE TaskCorpInsights;
GO
CREATE TABLE dbo.Users (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    email NVARCHAR(254) NOT NULL UNIQUE
);

CREATE TABLE dbo.Tasks (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    title NVARCHAR(200) NOT NULL,
    description NVARCHAR(2000) NULL,
    status NVARCHAR(10) NOT NULL DEFAULT N'To Do',
    assigned_to INT NOT NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Tasks_Status CHECK (status IN (N'To Do', N'Doing', N'Done')),
    CONSTRAINT FK_Tasks_Users FOREIGN KEY (assigned_to) REFERENCES dbo.Users(id)
);

CREATE TABLE dbo.FocusSessions (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    user_id INT NOT NULL,
    duration_minutes INT NOT NULL,
    logged_date DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_FocusSessions_Duration CHECK (duration_minutes BETWEEN 1 AND 1440),
    CONSTRAINT FK_FocusSessions_Users FOREIGN KEY (user_id) REFERENCES dbo.Users(id)
);

CREATE INDEX IX_Tasks_AssignedTo ON dbo.Tasks(assigned_to);
CREATE INDEX IX_FocusSessions_UserDate ON dbo.FocusSessions(user_id, logged_date);
GO

