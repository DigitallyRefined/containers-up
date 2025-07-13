import { mainLogger, getLogs } from '@/backend/utils/logger';
import { execAsync } from '@/backend/utils';

const logger = mainLogger.child({ event: 'containers-cleanup' });

const runCmd = async (cmd: string) => (await execAsync(cmd)).stdout.trim();

export const containersCleanup = async (context: string) => {
  // Get all untagged images
  const untaggedImages = (
    await runCmd(`docker --context ${context} images --filter "dangling=true" --format "{{.ID}}"`)
  )
    .split('\n')
    .filter((id) => id);

  for (const imageId of untaggedImages) {
    // Get creation date
    let createdDate = await runCmd(
      `docker --context ${context} inspect -f '{{.Created}}' ${imageId}`
    );
    createdDate = createdDate.split('T')[0].replace(/-/g, '.');

    // Get repository
    let repo = await runCmd(
      `docker --context ${context} inspect -f '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' ${imageId}`
    );
    if (!repo) {
      repo = 'untagged';
    }
    repo = repo.split('@')[0].split(':')[0];

    // Tag image
    await runCmd(`docker --context ${context} tag ${imageId} ${repo}:${createdDate}`);
    logger.info(`Tagged image ${imageId} as ${repo}:${createdDate}`);
  }

  // Remove older duplicate images
  const images = (
    await runCmd(`docker --context ${context} images --format "{{.Repository}}:{{.Tag}}"`)
  )
    .split('\n')
    .filter((img) => img);

  const imageMap: { [key: string]: boolean } = {};

  for (const image of images) {
    const imageWithoutTag = image.split(':')[0];
    if (imageMap[imageWithoutTag]) {
      logger.info(`Removing previous image: ${image}`);
      await runCmd(`docker --context ${context} rmi ${image}`);
    } else {
      imageMap[imageWithoutTag] = true;
    }
  }

  return getLogs('containers-cleanup');
};
