import type { Logger } from 'pino';

import { createExec } from '@/backend/utils/exec';
import type { Host } from '@/backend/db/schema/host';

export const getDockerCmd = (context: string) => `docker --context "${context}"`;

export const createDockerExec = (logger: Logger) => {
  const exec = createExec(logger);

  const parseDockerStdout = (stdout: string) => {
    try {
      return stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (err) {
      logger.error({ stdout, err }, 'Failed to parse docker stdout');
      throw err;
    }
  };

  const runParsedDockerCommand = async (command: string) => {
    const { stdout } = await exec.run(command);
    return parseDockerStdout(stdout);
  };

  const runStreamedCommand = (command: string, options?: { hostName: string; host: string }) => {
    const encoder = new TextEncoder();

    let closed = false; // shared between start and cancel

    const stream = new ReadableStream({
      start(controller) {
        const safeEnqueue = (data) => {
          if (closed) return;
          try {
            const chunk = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
            controller.enqueue(chunk);
          } catch (err) {
            logger.warn(`Failed to enqueue data: ${err.message}`);
            closed = true;
          }
        };

        const safeClose = () => {
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch (err) {
              logger.warn(`Failed to close controller: ${err.message}`);
            }
          }
        };

        const handlers = {
          onStdout: (data) => safeEnqueue(data),
          onStderr: (data) => safeEnqueue(data),
          onClose: () => safeClose(),
          onError: (err: Error) => {
            safeEnqueue(`Error: ${err.message}\n`);
            safeClose();
          },
        };

        if (options) {
          exec.sshStream(options.hostName, options.host, command, handlers);
        } else {
          exec.stream(command, handlers);
        }
      },

      cancel() {
        closed = true; // prevent any further enqueues
        // No cleanup — but we do stop safeEnqueue from acting
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
      action: 'restart' | 'stop' | 'start' | 'rm'
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
    restartCompose: (hostName: string, host: string, composeFile: string, pullFirst = false) => {
      let command = '';
      if (pullFirst) {
        command = `docker compose -f "${composeFile}" pull && `;
      }
      command += `docker compose -f "${composeFile}" down && docker compose -f "${composeFile}" up -d`;
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

      if (code !== 0) {
        logger.error({ code, stdout }, `Failed to get local image digest for "${image}"`);
        return '';
      }

      const digest = stdout.trim();

      logger.debug({ digest }, `Local image digest for "${image}"`);

      // Extract manifest digest from local repository digest
      // Local digest format: registry.com/repo@sha256:abc123...
      // Remote digest format: sha256:abc123...
      return digest.includes('@') ? digest.split('@')[1] : digest;
    },
    getLocalImageConfigDigest: async (context: string, image: string) => {
      // Prefer .Id which equals the digest of the image's config JSON (image ID)
      let result = await exec.run(
        `${getDockerCmd(context)} image inspect --format='{{.Id}}' "${image}"`,
        false
      );

      if (result.code !== 0 || !result.stdout.trim()) {
        // Fallback to .Config.Image if available on this docker version
        result = await exec.run(
          `${getDockerCmd(context)} image inspect --format='{{.Config.Image}}' "${image}"`,
          false
        );
      }

      if (result.code !== 0 || !result.stdout.trim()) {
        logger.error(
          { code: result.code, stdout: result.stdout },
          `Failed to get local image config digest for "${image}"`
        );
        return '';
      }

      const configDigest = result.stdout.trim();
      logger.debug({ configDigest }, `Local image config digest for "${image}"`);
      return configDigest;
    },
    getServerPlatform: async (context: string) => {
      const { stdout, code } = await exec.run(
        `${getDockerCmd(context)} version --format '{{json .Server}}'`,
        false
      );

      if (code !== 0) {
        logger.warn(
          { code, stdout },
          `Failed to get Docker server platform for context "${context}"`
        );
        return { os: 'linux', arch: 'amd64' };
      }

      try {
        const server = JSON.parse(stdout.trim());
        const os = server?.Os || server?.os;
        const arch = server?.Arch || server?.arch;
        if (!os || !arch) {
          logger.warn({ server }, `Unexpected Docker server JSON for platform`);
          return { os: 'linux', arch: 'amd64' };
        }
        return { os, arch };
      } catch (err) {
        logger.warn({ err, stdout }, `Failed to parse Docker server JSON`);
        return { os: 'linux', arch: 'amd64' };
      }
    },
    getRemoteImageDigest: async (selectedHost: Host, image: string) => {
      const { stdout, code } = await exec.sshRun(
        selectedHost.name,
        selectedHost.sshHost,
        `docker buildx imagetools inspect --format "{{json .Manifest.Digest}}" "${image}"`
      );

      if (code !== 0) {
        logger.error(
          { code, stdout },
          `Failed to get remote image digest for "${image}" on "${selectedHost.name}"`
        );
        return '';
      }

      const digest = parseDockerStdout(stdout)[0];

      logger.debug({ digest }, `Remote image digest for "${image}"`);

      return digest;
    },
  };
};
