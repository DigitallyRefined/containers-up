import * as path from 'path';

import { execAsync } from '@/backend/utils';
import { mainLogger, getLogs } from '@/backend/utils/logger';
import type { Repo } from '@/backend/db/repo';
import { containersCleanup } from '@/backend/endpoints/containers-cleanup';

const logger = mainLogger.child({ event: 'github-webhook' });

export type GitHubWebhookEvent = {
  repo: string;
  action: string;
  merged: string;
  title: string;
};

// Helper functions moved to top level
function fileExcluded(file: string, excludeFolders: string | null): boolean {
  if (!excludeFolders || excludeFolders === 'null') return false;
  const regex = new RegExp(excludeFolders);
  return regex.test(file);
}

async function composePullDownUp(sshCmd: string, composeFile: string) {
  logger.info(`Pulling images for compose file: ${composeFile}`);
  await execAsync(`ssh ${sshCmd} 'docker compose -f ${composeFile} pull'`);
  logger.info(`Stopping and removing containers for compose file: ${composeFile}`);
  await execAsync(`ssh ${sshCmd} 'docker compose -f ${composeFile} down'`);
  logger.info(`Starting containers for compose file: ${composeFile}`);
  await execAsync(`ssh ${sshCmd} 'docker compose -f ${composeFile} up -d'`);
}

const pullRestartUpdatedContainers = async ({ title }: GitHubWebhookEvent, repoConfig: Repo) => {
  try {
    const { workingFolder, excludeFolders, name, sshCmd } = repoConfig;
    await execAsync(`ssh ${sshCmd} 'cd ${workingFolder} && git pull --prune'`);

    // Extract folder from title (like sed -E 's/.* in (.*)/\1/')
    const folderMatch = title.match(/ in (.*)/);
    const folder = folderMatch ? folderMatch[1] : '';
    const file = path.join(workingFolder, folder, 'docker-compose.yml');

    const { stdout: fileExists } = await execAsync(
      `ssh ${sshCmd} 'test -f "${file}" && echo exists || echo missing'`
    );
    if (fileExists.trim() === 'exists') {
      if (!fileExcluded(file, excludeFolders)) {
        await composePullDownUp(name, file);
      } else {
        logger.info(`docker-compose.yml file excluded: ${file}`);
      }
    } else {
      // Single Dependabot watch (via git diff)
      const { stdout } = await execAsync(
        `ssh ${sshCmd} 'cd ${workingFolder} && git diff --name-only HEAD~1 HEAD'`
      );
      const changedFiles = stdout.split('\n').filter(Boolean);
      if (changedFiles.some((f) => f.endsWith('docker-compose.yml'))) {
        for (const changedFile of changedFiles) {
          if (
            changedFile.endsWith('docker-compose.yml') &&
            !fileExcluded(changedFile, excludeFolders)
          ) {
            await composePullDownUp(name, changedFile);
          }
        }
      } else {
        logger.info('No docker-compose.yml files have been changed');
      }
    }
  } catch (err: any) {
    logger.error(err);
  }

  return getLogs('github-webhook');
};

export const githubWebhookHandler = async (webhookEvent: GitHubWebhookEvent, repoConfig: Repo) => {
  const { action, merged, title } = webhookEvent;

  let logs = [];
  if (!repoConfig.workingFolder || action !== 'closed' || !merged || !title) {
    console.log(
      `No action required for workingFolder: '${repoConfig.workingFolder}' action: '${action}' merged: '${merged}' title: '${title}'`
    );
  } else {
    logs = [
      await pullRestartUpdatedContainers(webhookEvent, repoConfig),
      await containersCleanup(repoConfig.name),
    ].flat();
  }

  // save logs
  console.log(logs);
};
