import path from 'node:path';
import type { Logger } from 'pino';
import { job as jobDb } from '@/backend/db/job';
import type { Host } from '@/backend/db/schema/host';
import { isComposeFilename } from '@/backend/utils';
import { createDockerExec } from '@/backend/utils/docker';
import { createExec } from '@/backend/utils/exec';
import { squashUpdates } from '@/backend/utils/git';

const SQUASH_UPDATE_DELAY_MINUTES = Number.parseInt(
  process.env.SQUASH_UPDATE_DELAY_MINUTES || '15'
);
const SQUASH_UPDATE_DELAY_MS = SQUASH_UPDATE_DELAY_MINUTES * 60 * 1000;
const squashUpdateTimers = new Map<number, ReturnType<typeof setTimeout>>();

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
  const { id, workingFolder, excludeFolders, name, sshHost: host } = repoConfig;

  const exec = createExec(logger);
  const dockerExec = createDockerExec(logger);
  const sshRun = (cmd: string) => exec.sshRun(name, host, `cd ${workingFolder} && ${cmd}`);

  const restartComposeIfNotExcluded = async (composeFolder: string) => {
    if (folderExcluded(composeFolder, excludeFolders)) {
      logger.info(`Compose folder excluded: ${composeFolder}`);
      return;
    }

    logger.info(`Restarting services in: ${composeFolder}`);
    const response = dockerExec.restartCompose(name, host, composeFolder, true);
    await response.text();
  };

  const checkAndSquashUpdates = async () => {
    if (repoConfig.squashUpdates && (await jobDb.getIncompleteJobsWithPr(id)).length <= 1) {
      const existingTimer = squashUpdateTimers.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      logger.info(
        `Scheduling squash updates in ${SQUASH_UPDATE_DELAY_MINUTES} minutes for host ${name}`
      );

      const timer = setTimeout(() => {
        squashUpdateTimers.delete(id);
        void (async () => {
          try {
            await squashUpdates(sshRun, id, repoConfig.id);
          } catch (err) {
            logger.error({ err }, `Failed to squash update commits for host ${name}`);
          }
        })();
      }, SQUASH_UPDATE_DELAY_MS);

      squashUpdateTimers.set(id, timer);
    }
  };

  await sshRun(`git pull --prune`);

  let composeFolderExists = 'missing';
  let containerFolder = '';

  if (folder) {
    containerFolder = path.join(workingFolder, folder);
    const { stdout } = await sshRun(`test -d "${containerFolder}" && echo exists || echo missing`);
    composeFolderExists = stdout;
  }

  if (composeFolderExists === 'exists') {
    await restartComposeIfNotExcluded(containerFolder);
  } else {
    // Single compose file watch (via git diff)
    const { stdout: changedFilesStdout } = await sshRun(`git diff --name-only HEAD~1 HEAD`);
    const changedFiles = changedFilesStdout.split('\n').filter(Boolean);

    if (!changedFiles.some((f: string) => isComposeFilename(f))) {
      logger.info('No compose YAML files have been changed');
      return;
    }

    for (const changedFile of changedFiles) {
      const composeFolder = path.dirname(path.join(workingFolder, changedFile));
      await restartComposeIfNotExcluded(composeFolder);
    }
  }
  await checkAndSquashUpdates();
};
