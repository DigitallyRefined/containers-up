import { execAsync } from '.';

const parseStdout = (stdout: string) =>
  stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

export async function listContainers() {
  const { stdout } = await execAsync('docker inspect --format "{{json .}}" $(docker ps -aq)');

  return parseStdout(stdout);
}

export const inspectImage = async (imageId: string) => {
  const { stdout } = await execAsync(`docker inspect ${imageId}`);
  return JSON.parse(stdout)[0];
};

export const listImages = async () => {
  const { stdout } = await execAsync(`docker images --no-trunc --format "{{json .}}"`);
  return parseStdout(stdout);
};
