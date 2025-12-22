import type { Host } from '@/backend/db/schema/host';
import { getContainers } from '@/backend/endpoints/containers';
import { createExec } from '@/backend/utils/exec';
import { mainLogger } from '@/backend/utils/logger';

const event = 'compose';
const logger = mainLogger.child({ event });
const exec = createExec(logger);

export const findNonRunningComposeFiles = async (host: Host) => {
  if (!host.workingFolder) {
    throw new Error('Working folder is not configured', { cause: 'NO_WORKING_FOLDER' });
  }

  const findCmd = `find ${host.workingFolder}/ -maxdepth ${process.env.RUN_COMPOSE_MAX_DEPTH || 3} -regextype posix-extended -regex ".*/(docker-)?compose.ya?ml$" 2>/dev/null`;

  try {
    const { stdout } = await exec.sshRun(host.name, host.sshHost, findCmd, false);
    const { composedContainers } = await getContainers(host);

    return stdout
      .split('\n')
      .filter((line: string) => /(^|\/)(docker-)?compose\.ya?ml$/.test(line))
      .map((line: string) => line.replace(`${host.workingFolder}/`, ''))
      .filter((composeFile: string) => !Object.keys(composedContainers).includes(composeFile))
      .sort();
  } catch (error) {
    logger.error({ error }, 'Error finding non-running container compose files');
    return [];
  }
};
