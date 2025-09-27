PRAGMA foreign_keys = OFF;
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
	"sortOrder"				INTEGER,
	"created"					DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
INSERT INTO `host_tmp` (`id`, `name`, `sshHost`, `repo`, `webhookSecret`, `workingFolder`, `excludeFolders`, `cron`, `created`) SELECT `id`, `name`, `sshHost`, `repo`, `webhookSecret`, `workingFolder`, `excludeFolders`, `cron`, `created` FROM `host`;
DROP TABLE `host`;
ALTER TABLE `host_tmp` RENAME TO `host`;
COMMIT;
PRAGMA foreign_keys = ON;