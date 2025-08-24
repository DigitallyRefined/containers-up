import type { Logger } from 'pino';

import { createExec } from '@/backend/utils/exec';
import type { Host } from '@/backend/db/schema/host';

const parseDockerStdout = (stdout: string) =>
  stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

export const getDockerCmd = (context: string) => `docker --context "${context}"`;

export const createDockerExec = (logger: Logger) => {
  const exec = createExec(logger);

  const runParsedDockerCommand = async (command: string) => {
    const { stdout } = await exec.run(command);
    return parseDockerStdout(stdout);
  };

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

  return {
    listContainers: async (context: string) =>
      runParsedDockerCommand(
        `${getDockerCmd(context)} inspect --format "{{json .}}" $(${getDockerCmd(
          context
        )} ps -aq --no-trunc)`
      ),
    listImages: async (context: string) =>
      runParsedDockerCommand(`${getDockerCmd(context)} images --no-trunc --format "{{json .}}"`),
    restartOrStopContainer: (
      context: string,
      containerId: string,
      action: 'restart' | 'stop' | 'start' | 'remove'
    ) => runStreamedCommand(`${getDockerCmd(context)} ${action} "${containerId}"`),
    removeImage: (context: string, imageId: string) =>
      runStreamedCommand(`${getDockerCmd(context)} rmi "${imageId}"`),
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
    startCompose: (hostName: string, host: string, composeFile: string) =>
      runStreamedCommand(`docker compose -f "${composeFile}" up -d`, {
        hostName,
        host,
      }),
    restartCompose: (hostName: string, host: string, composeFile: string) => {
      let command = `docker compose -f "${composeFile}" down && docker compose -f "${composeFile}" up -d`;
      if (composeFile.includes('containers-up')) {
        command = `nohup bash -c "${command}" >> /tmp/containers-up.log 2>&1 &`;
      }
      return runStreamedCommand(command, {
        hostName,
        host,
      });
    },
    getLocalImageDigest: async (context: string, image: string) => {
      const { stdout, code } = await exec.run(
        `${getDockerCmd(context)} image inspect --format="{{index .RepoDigests 0}}" "${image}"`,
        false
      );
      return code === 0 ? stdout.trim() : null;
    },
    getRemoteImageDigest: async (selectedHost: Host, image: string) => {
      const { stdout } = await exec.sshRun(
        selectedHost.name,
        selectedHost.sshHost,
        `docker buildx imagetools inspect --format "{{json .Manifest.Digest}}" "${image}"`
      );

      return parseDockerStdout(stdout)[0];
    },
  };
};
