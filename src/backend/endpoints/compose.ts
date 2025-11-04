import { createExec } from '@/backend/utils/exec';
import { mainLogger } from '@/backend/utils/logger';

const event = 'compose';
const logger = mainLogger.child({ event });
const exec = createExec(logger);

export const findComposeFiles = async (hostName: string, host: string, workingFolder?: string) => {
  if (!workingFolder) {
    throw new Error('Working folder is not configured', { cause: 'NO_WORKING_FOLDER' });
  }

  const sshHost = `find ${workingFolder}/ -regextype posix-extended -regex ".*/(docker-)?compose.ya?ml$" 2>/dev/null`;
  const { stdout } = await exec.sshRun(hostName, host, sshHost, false);
  return stdout
    .split('\n')
    .filter((line: string) => /(^|\/)(docker-)?compose\.ya?ml$/.test(line))
    .map((line: string) => line.replace(`${workingFolder}/`, ''))
    .sort();
};
