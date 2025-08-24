PRAGMA foreign_keys = OFF;
BEGIN;
CREATE TABLE `job_tmp` (
	"id"	INTEGER NOT NULL,
	"hostId"	INTEGER NOT NULL,
	"repoPr"	TEXT,
	"folder"	TEXT NOT NULL,
	"title"	  TEXT NOT NULL UNIQUE,
	"status"	INTEGER NOT NULL,
	"created"	DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updated"	DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
INSERT INTO `job_tmp` (`id`, `hostId`, `repoPr`, `folder`, `title`, `status`, `created`, `updated`) SELECT `id`, `hostId`, `repoPr`, `folder`, `title`, `status`, `created`, `updated` FROM `job`;
DROP TABLE `job`;
ALTER TABLE `job_tmp` RENAME TO `job`;
COMMIT;
PRAGMA foreign_keys = ON;