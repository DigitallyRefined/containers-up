import { mainLogger, getLogs } from '@/backend/utils/logger';
import { createExec } from '@/backend/utils/exec';
import { getDockerCmd } from '@/backend/utils/docker';
import { log as logDb } from '@/backend/db/log';

export const containersCleanup = async (context: string) => {
  const event = `containers-cleanup ${context}`;
  const logger = mainLogger.child({ event });
  const exec = createExec(logger);

  const { stdout: systemPruneStdout, stderr: systemPruneStderr } = await exec.run(
    `${getDockerCmd(context)} system prune -f`
  );
  if (systemPruneStdout.includes('\n') || !systemPruneStdout.includes('0B'))
    logger.info(`System prune: ${systemPruneStdout}`);

  // Get all untagged images
  const { stdout: untaggedImagesStdout } = await exec.run(
    `docker --context ${context} images --filter "dangling=true" --format "{{.ID}}"`
  );
  const untaggedImages = untaggedImagesStdout.split('\n').filter((id) => id);

  for (const imageId of untaggedImages) {
    // Get creation date
    let { stdout: createdDate } = await exec.run(
      `${getDockerCmd(context)} inspect -f '{{.Created}}' "${imageId}"`
    );
    createdDate = createdDate.split('T')[0].replace(/-/g, '.');

    let { stdout: repo } = await exec.run(
      `${getDockerCmd(
        context
      )} inspect -f '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' "${imageId}"`
    );
    if (repo) {
      const hostName = repo.split('@')[0].split(':')[0];
      await exec.run(`${getDockerCmd(context)} tag "${imageId}" "${hostName}:${createdDate}"`);
      logger.info(`Tagged image ${imageId} as ${hostName}:${createdDate}`);
    }
  }

  // Remove older duplicate images
  const { stdout: imagesStdout } = await exec.run(
    `${getDockerCmd(context)} images --format "{{.Repository}}:{{.Tag}}"`
  );
  const images = imagesStdout.split('\n').filter((img) => img);

  const seenImageMap: { [key: string]: boolean } = {};

  for (const image of images) {
    const imageWithoutTag = image.split(':')[0];
    if (seenImageMap[imageWithoutTag] && imageWithoutTag !== '<none>') {
      logger.info(`Removing previous image: ${image}`);
      await exec.run(`${getDockerCmd(context)} rmi -f "${image}"`);
    } else {
      seenImageMap[imageWithoutTag] = true;
    }
  }

  logDb.removeOldLogs();

  return getLogs(event);
};
