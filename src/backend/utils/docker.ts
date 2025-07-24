import type { Logger } from 'pino';

import { createExec } from '@/backend/utils/exec';
import type { Host } from '@/backend/db/schema/host';
import { mainLogger } from '@/backend/utils/logger';

const exec = createExec(mainLogger);

const parseDockerStdout = (stdout: string) =>
  stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

export const getDockerCmd = (context: string) => `docker --context ${context}`;

const runStreamedCommand = (command: string, options?: { hostName: string; host: string }) => {
  const stream = new ReadableStream({
    start(controller) {
      const handlers = {
        onStdout: (data) => controller.enqueue(data),
        onStderr: (data) => controller.enqueue(data),
        onClose: () => controller.close(),
        onError: (err) => {
          controller.enqueue(Buffer.from(`Error: ${err.message}\n`));
          controller.close();
        },
      };

      if (options) {
        exec.sshStream(options.hostName, options.host, command, handlers);
      } else {
        exec.stream(command, handlers);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
};

export const createDockerExec = (logger: Logger) => {
  const exec = createExec(logger);

  return {
    listContainers: async (context: string) => {
      const { stdout } = await exec.run(
        `${getDockerCmd(context)} inspect --format "{{json .}}" $(${getDockerCmd(context)} ps -aq)`
      );

      return parseDockerStdout(stdout);
    },
    listImages: async (context: string) => {
      const { stdout } = await exec.run(
        `${getDockerCmd(context)} images --no-trunc --format "{{json .}}"`
      );
      return parseDockerStdout(stdout);
    },
    restartOrStopContainer: (
      context: string,
      containerId: string,
      action: 'restart' | 'stop' | 'start' | 'remove'
    ) => {
      return runStreamedCommand(`${getDockerCmd(context)} ${action} "${containerId}"`);
    },
    removeImage: (context: string, imageId: string) => {
      return runStreamedCommand(`${getDockerCmd(context)} rmi "${imageId}"`);
    },
    isInvalidComposeFile: async (host: Host, composeFile: string) =>
      typeof composeFile !== 'string' ||
      !/(docker-compose|compose)\.ya?ml$/.test(composeFile) ||
      !(await exec.pathExistsOnRemote(host.name, host.sshHost, composeFile)),
    stopCompose: (hostName: string, host: string, composeFile: string) => {
      return runStreamedCommand(`docker compose -f "${composeFile}" down`, {
        hostName,
        host,
      });
    },
    startCompose: (hostName: string, host: string, composeFile: string) => {
      return runStreamedCommand(`docker compose -f "${composeFile}" up -d`, {
        hostName,
        host,
      });
    },
    restartCompose: (hostName: string, host: string, composeFile: string) => {
      return runStreamedCommand(
        `docker compose -f "${composeFile}" down && docker compose -f "${composeFile}" up -d`,
        {
          hostName,
          host,
        }
      );
    },
  };
};
