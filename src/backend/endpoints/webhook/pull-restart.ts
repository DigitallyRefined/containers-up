import * as path from 'node:path';
import type { Logger } from 'pino';

import type { Host } from '@/backend/db/schema/host';
import { isComposeFilename } from '@/backend/utils';
import { createDockerExec } from '@/backend/utils/docker';
import { createExec } from '@/backend/utils/exec';

const folderExcluded = (folder: string, excludeFolders: string | null): boolean => {
  if (!excludeFolders || excludeFolders === 'null') return false;
  const regex = new RegExp(excludeFolders);
  return regex.test(folder);
};

export const pullRestartUpdatedContainers = async (
  folder: string | null,
  repoConfig: Host,
  logger: Logger
) => {
  const { workingFolder, excludeFolders, name, sshHost: host } = repoConfig;

  const exec = createExec(logger);
  const dockerExec = createDockerExec(logger);

  const composePullDownUp = async (composeFolder: string) => {
    logger.info(`Restarting services for compose file: ${composeFolder}`);
    const response = dockerExec.restartCompose(name, host, composeFolder, true);
    await response.text();
  };

  await exec.sshRun(name, host, `cd ${workingFolder} && git pull --prune`);

  let composeFolderExists = 'missing';
  let containerFolder = '';

  if (folder) {
    containerFolder = path.join(workingFolder, folder);
    const { stdout } = await exec.sshRun(
      name,
      host,
      `test -d "${containerFolder}" && echo exists || echo missing`
    );
    composeFolderExists = stdout;
  }

  if (composeFolderExists === 'exists') {
    if (!folderExcluded(containerFolder, excludeFolders)) {
      await composePullDownUp(containerFolder);
    } else {
      logger.info(`Compose folder excluded: ${containerFolder}`);
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
        if (isComposeFilename(changedFile) && !folderExcluded(changedFile, excludeFolders)) {
          await composePullDownUp(changedFile);
        }
      }
    } else {
      logger.info('No compose YAML files have been changed');
    }
  }
};
