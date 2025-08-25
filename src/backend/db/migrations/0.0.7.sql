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

BEGIN;
CREATE TABLE `host_tmp` (
	"id"							INTEGER NOT NULL,
	"name"						TEXT NOT NULL UNIQUE,
	"sshHost"					TEXT NOT NULL,
	"repo"						TEXT UNIQUE,
	"webhookSecret"		TEXT,
	"workingFolder"		TEXT,
	"excludeFolders"	TEXT,
	"cron"						TEXT,
	"created"					DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
INSERT INTO `host_tmp` (`id`, `name`, `sshHost`, `repo`, `webhookSecret`, `workingFolder`, `excludeFolders`, `created`) SELECT `id`, `name`, `sshHost`, `repo`, `webhookSecret`, `workingFolder`, `excludeFolders`, `created` FROM `host`;
DROP TABLE `host`;
ALTER TABLE `host_tmp` RENAME TO `host`;
COMMIT;
PRAGMA foreign_keys = ON;