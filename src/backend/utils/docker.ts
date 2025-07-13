import { execAsync } from '@/backend/utils';

const parseStdout = (stdout: string) =>
  stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

export async function listContainers(context: string) {
  const { stdout } = await execAsync(
    `docker --context ${context} inspect --format "{{json .}}" $(docker --context ${context} ps -aq)`
  );

  return parseStdout(stdout);
}

export const listImages = async (context: string) => {
  const { stdout } = await execAsync(
    `docker --context ${context} images --no-trunc --format "{{json .}}"`
  );
  return parseStdout(stdout);
};
