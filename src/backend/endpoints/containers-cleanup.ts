import { mainLogger, getLogs } from '@/backend/utils/logger';
import { execAsync } from '../utils';
import { inspectImage, listImages } from '../utils/docker';

const logger = mainLogger.child({ event: 'containers-cleanup' });

export const containersCleanup = async () => {
  try {
    // Get all untagged (dangling) images
    const images = await listImages();
    for (const image of images) {
      const imageId = image.ID;
      // Get creation date
      const inspect = await inspectImage(imageId);
      const createdDate = inspect.Created.split('T')[0].replace(/-/g, '.');
      // Get repo digest
      let repo =
        inspect.RepoDigests && inspect.RepoDigests[0]
          ? inspect.RepoDigests[0].split('@')[0]
          : 'untagged';
      repo = repo.split(':')[0];
      // Tag image
      await execAsync(`docker tag ${imageId} ${repo}:${createdDate}`);
      logger.info(`Tagged image ${imageId} as ${repo}:${createdDate}`);
    }

    // Remove older duplicate images
    const allImages = await listImages();
    const imageMap = {};
    for (const img of allImages) {
      const repoTags =
        img.Repository !== '<none>' && img.Tag !== '<none>' ? [`${img.Repository}:${img.Tag}`] : [];
      for (const tag of repoTags) {
        const imageWithoutTag = tag.split(':')[0];
        if (imageMap[imageWithoutTag]) {
          logger.info(`Removing previous image: ${tag}`);
          try {
            await execAsync(`docker rmi ${tag}`);
          } catch (e) {
            logger.warn({ err: e }, `Failed to remove image ${tag}`);
          }
        } else {
          imageMap[imageWithoutTag] = true;
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error during docker cleanup');
  }

  const logs = getLogs('containers-cleanup');
  return logs.length ? logs : { message: 'No cleanup actions performed' };
};
