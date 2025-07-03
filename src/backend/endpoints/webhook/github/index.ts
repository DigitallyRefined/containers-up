import * as path from 'path';

import { execAsync, pathExists } from '@/backend/utils';
import { mainLogger, getLogs } from '@/backend/utils/logger';
import type { Repo } from '@/backend/db/repo';

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

async function composePullDownUp(composeFile: string) {
  logger.info(`Pulling images for compose file: ${composeFile}`);
  await execAsync(`docker compose -f ${composeFile} pull`);
  logger.info(`Stopping and removing containers for compose file: ${composeFile}`);
  await execAsync(`docker compose -f ${composeFile} down`);
  logger.info(`Starting containers for compose file: ${composeFile}`);
  await execAsync(`docker compose -f ${composeFile} up -d`);
}

const pullRestartUpdatedContainers = async ({ title }: GitHubWebhookEvent, repoConfig: Repo) => {
  try {
    const { workingFolder, excludeFolders } = repoConfig;
    process.chdir(workingFolder);
    await execAsync('GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no" git pull --prune');

    // Extract folder from title (like sed -E 's/.* in (.*)/\1/')
    const folderMatch = title.match(/ in (.*)/);
    const folder = folderMatch ? folderMatch[1] : '';
    const file = path.join(workingFolder, folder, 'docker-compose.yml');

    if (await pathExists(file)) {
      if (!fileExcluded(file, excludeFolders)) {
        await composePullDownUp(file);
      } else {
        logger.info(`docker-compose.yml file not found or excluded: ${file}`);
      }
    } else {
      // Single Dependabot watch (via git diff)
      const { stdout } = await execAsync('git diff --name-only HEAD~1 HEAD');
      const changed_files = stdout.split('\n').filter(Boolean);
      if (changed_files.some((f) => f.endsWith('docker-compose.yml'))) {
        for (const file of changed_files) {
          if (file.endsWith('docker-compose.yml') && !fileExcluded(file, excludeFolders)) {
            await composePullDownUp(file);
          }
        }
      } else {
        logger.info('No docker-compose.yml files have been changed');
      }
    }
  } catch (err: any) {
    logger.error(err);
  }
};

export const githubWebhookHandler = async (webhookEvent: GitHubWebhookEvent, repoConfig: Repo) => {
  const { action, merged, title } = webhookEvent;

  if (!repoConfig.workingFolder || action !== 'closed' || !merged || !title) {
    console.log(
      `No action required for workingFolder: '${repoConfig.workingFolder}' action: '${action}' merged: '${merged}' title: '${title}'`
    );
  } else {
    pullRestartUpdatedContainers(webhookEvent, repoConfig);
  }

  // save logs
  const logs = getLogs();
  console.log(logs);
};
