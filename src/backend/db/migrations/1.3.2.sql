PRAGMA foreign_keys = OFF;
BEGIN;
DROP TABLE IF EXISTS job_tmp;
CREATE TABLE job_tmp (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  hostId INTEGER NOT NULL,
  repoPr TEXT,
  folder TEXT NOT NULL,
  title TEXT NOT NULL,
  status INTEGER NOT NULL,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hostId, title)
);

INSERT INTO job_tmp (id, hostId, repoPr, folder, title, status, created, updated)
SELECT id, hostId, repoPr, folder, title, status, created, updated FROM job;

DROP TABLE job;

ALTER TABLE job_tmp RENAME TO job;
COMMIT;
PRAGMA foreign_keys = ON;