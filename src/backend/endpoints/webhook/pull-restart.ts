import * as path from 'node:path';
import type { Logger } from 'pino';

import type { Host } from '@/backend/db/schema/host';
import { isComposeFilename } from '@/backend/utils';
import { createDockerExec } from '@/backend/utils/docker';
import { createExec } from '@/backend/utils/exec';

const composeFilename = process.env.COMPOSE_FILENAME || 'compose.yml';

const fileExcluded = (file: string, excludeFolders: string | null): boolean => {
  if (!excludeFolders || excludeFolders === 'null') return false;
  const regex = new RegExp(excludeFolders);
  return regex.test(file);
};

export const pullRestartUpdatedContainers = async (
  folder: string | null,
  repoConfig: Host,
  logger: Logger
) => {
  const { workingFolder, excludeFolders, name, sshHost: host } = repoConfig;

  const exec = createExec(logger);
  const dockerExec = createDockerExec(logger);

  const composePullDownUp = async (composeFile: string) => {
    logger.info(`Restarting services for compose file: ${composeFile}`);
    const response = dockerExec.restartCompose(name, host, composeFile, true);
    await response.text();
  };

  await exec.sshRun(name, host, `cd ${workingFolder} && git pull --prune`);

  let fileExists = 'missing';
  let file = '';

  if (folder) {
    file = path.join(workingFolder, folder, composeFilename);
    const { stdout } = await exec.sshRun(
      name,
      host,
      `test -f "${file}" && echo exists || echo missing`
    );
    fileExists = stdout;
  }

  if (fileExists === 'exists') {
    if (!fileExcluded(file, excludeFolders)) {
      await composePullDownUp(file);
    } else {
      logger.info(`Compose file excluded: ${file}`);
    }
  } else {
    // Single compose file watch (via git diff)
    const { stdout: changedFilesStdout } = await exec.sshRun(
      name,
      host,
      `cd ${workingFolder} && git diff --name-only HEAD~1 HEAD`
    );
    const changedFiles = changedFilesStdout.split('\n').filter(Boolean);
    if (changedFiles.some((f: string) => isComposeFilename(f))) {
      for (const changedFile of changedFiles) {
        if (isComposeFilename(changedFile) && !fileExcluded(changedFile, excludeFolders)) {
          await composePullDownUp(changedFile);
        }
      }
    } else {
      logger.info('No compose YAML files have been changed');
    }
  }
};
