import { mainLogger, getLogs } from '@/backend/utils/logger';
import { createExec } from '@/backend/utils/exec';
import { getDockerCmd } from '@/backend/utils/docker';

export const containersCleanup = async (context: string) => {
  const event = `containers-cleanup ${context}`;
  const logger = mainLogger.child({ event });
  const exec = createExec(logger);

  // Get all untagged images
  const { stdout: untaggedImagesStdout } = await exec.run(
    `docker --context ${context} images --filter "dangling=true" --format "{{.ID}}"`
  );
  const untaggedImages = untaggedImagesStdout.split('\n').filter((id) => id);

  for (const imageId of untaggedImages) {
    // Get creation date
    let { stdout: createdDate } = await exec.run(
      `${getDockerCmd(context)} inspect -f '{{.Created}}' ${imageId}`
    );
    createdDate = createdDate.split('T')[0].replace(/-/g, '.');

    // Get repository
    let { stdout: repo } = await exec.run(
      `${getDockerCmd(
        context
      )} inspect -f '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' ${imageId}`
    );
    if (!repo) {
      repo = 'untagged';
    }
    repo = repo.split('@')[0].split(':')[0];

    // Tag image
    await exec.run(`${getDockerCmd(context)} tag ${imageId} ${repo}:${createdDate}`);
    logger.info(`Tagged image ${imageId} as ${repo}:${createdDate}`);
  }

  // Remove older duplicate images
  const { stdout: imagesStdout } = await exec.run(
    `${getDockerCmd(context)} images --format "{{.Repository}}:{{.Tag}}"`
  );
  const images = imagesStdout.split('\n').filter((img) => img);

  const imageMap: { [key: string]: boolean } = {};

  for (const image of images) {
    const imageWithoutTag = image.split(':')[0];
    if (imageMap[imageWithoutTag]) {
      logger.info(`Removing previous image: ${image}`);
      await exec.run(`${getDockerCmd(context)} rmi ${image}`);
    } else {
      imageMap[imageWithoutTag] = true;
    }
  }

  return getLogs(event);
};
