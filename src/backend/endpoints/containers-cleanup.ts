import { log as logDb } from '@/backend/db/log';
import { getDockerCmd } from '@/backend/utils/docker';
import { createExec } from '@/backend/utils/exec';
import { getLogs, mainLogger } from '@/backend/utils/logger';

export const containersCleanup = async (context: string) => {
  const event = `containers-cleanup ${context}`;
  const logger = mainLogger.child({ event });
  const exec = createExec(logger);

  const { stdout: systemPruneStdout } = await exec.run(`${getDockerCmd(context)} system prune -f`);
  if (systemPruneStdout.includes('\n') || !systemPruneStdout.includes('0B'))
    logger.info(`System prune: ${systemPruneStdout}`);

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
