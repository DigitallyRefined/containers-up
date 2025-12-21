PRAGMA foreign_keys = OFF;
BEGIN;
DROP TABLE IF EXISTS host_tmp;
CREATE TABLE IF NOT EXISTS `host_tmp` (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sshHost TEXT NOT NULL,
    repoHost TEXT DEFAULT 'https://github.com',
    repo TEXT,
    botType TEXT DEFAULT 'dependabot',
    webhookSecret TEXT,
    workingFolder TEXT,
    excludeFolders TEXT,
    cron TEXT,
    sortOrder INTEGER,
    created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repoHost, repo)
);
INSERT INTO `host_tmp` (id, name, sshHost, repo, webhookSecret, workingFolder, excludeFolders, cron, sortOrder, created) 
SELECT id, name, sshHost, repo, webhookSecret, workingFolder, excludeFolders, cron, sortOrder, created FROM host;
DROP TABLE host;
ALTER TABLE host_tmp RENAME TO host;
COMMIT;
PRAGMA foreign_keys = ON;
