PRAGMA foreign_keys = OFF;
BEGIN;
UPDATE job SET repoPr =
    'container:' ||
    substr(
        title,
        6,
        instr(title, ' from') - 6
    )
    || ':' ||
    substr(
        title,
        instr(title, ' to `') + 5,
        instr(substr(title, instr(title, ' to `') + 5), '`') - 1
    )
WHERE repoPr IS NULL;

DELETE FROM job
WHERE id NOT IN (
    SELECT MAX(id)
    FROM job
    GROUP BY repoPr
);

CREATE TABLE `job_tmp` (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  hostId INTEGER NOT NULL,
  repoPr TEXT NOT NULL,
  folder TEXT NOT NULL,
  title TEXT NOT NULL,
  status INTEGER NOT NULL,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hostId, repoPr)
);

INSERT INTO `job_tmp` (`id`, `hostId`, `repoPr`, `folder`, `title`, `status`, `created`, `updated`) SELECT `id`, `hostId`, `repoPr`, `folder`, `title`, `status`, `created`, `updated` FROM `job`;

DROP TABLE `job`;
ALTER TABLE `job_tmp` RENAME TO `job`;
COMMIT;
PRAGMA foreign_keys = ON;