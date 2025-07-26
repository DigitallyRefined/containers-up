import { serve, type ErrorLike, type Serve } from 'bun';
import index from '@/index.html';

import { getContainers, type SortOptions } from '@/backend/endpoints/containers';
import { githubWebhookHandler, type GitHubWebhookEvent } from '@/backend/endpoints/webhook/github';
import { containersCleanup } from '@/backend/endpoints/containers-cleanup';
import { deleteHost, getHosts, postHost, putHost } from '@/backend/endpoints/host';
import { host } from '@/backend/db/host';
import { log as logDb } from '@/backend/db/log';
import { restartJob } from '@/backend/endpoints/jobs';
import { job as jobDb } from '@/backend/db/job';
import { Host } from '@/backend/db/schema/host';
import { isValidContainerIdOrName } from '@/backend/utils';
import { createDockerExec } from '@/backend/utils/docker';
import { mainLogger } from '@/backend/utils/logger';
import { findComposeFiles } from '@/backend/endpoints/compose';

const dockerExec = createDockerExec(mainLogger);

const API_PROXY_KEY = process.env.API_PROXY_KEY;

const requireAuthKey = (req: Request) => {
  const key = req.headers.get(`x-proxy-key`);
  if (API_PROXY_KEY && key !== API_PROXY_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
};

const getAuthorizedHost = async (
  req: Request,
  repoHost: string
): Promise<{ error?: Response; selectedHost?: Host }> => {
  const auth = requireAuthKey(req);
  if (auth) return { error: auth };

  const selectedHost = await host.getByName(repoHost);
  if (!selectedHost) {
    return { error: new Response('Host not found', { status: 404 }) };
  }
  return { selectedHost };
};

async function resolveAndValidateComposeFile(selectedHost: Host, data: { composeFile: string }) {
  const composeFile = data.composeFile.startsWith('/')
    ? data.composeFile
    : `${selectedHost.workingFolder}/${data.composeFile}`;
  if (await dockerExec.isInvalidComposeFile(selectedHost, composeFile)) {
    return {
      composeError: Response.json({ error: 'Invalid or missing compose file' }, { status: 400 }),
    };
  }
  return { composeFile };
}

const serverOptions: Partial<Serve> = {
  idleTimeout: 30,

  error(error: ErrorLike) {
    console.error('Unhandled error in route handler:', error);
    return Response.json(
      {
        error: error.message || 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && {
          stack: error.stack,
          details: error.toString(),
        }),
        ...(error.cause && { cause: error.cause }),
      },
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  },

  development: process.env.NODE_ENV !== 'production' && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
};

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    '/*': index,

    '/icons/:name': async (req) => {
      const iconName = req.params.name;

      // Validate filename to prevent directory traversal
      if (
        !iconName ||
        iconName.includes('..') ||
        iconName.includes('/') ||
        iconName.includes('\\')
      ) {
        return new Response('File not found', { status: 404 });
      }

      // Only allow specific file extensions
      const allowedExtensions = ['.webp'];
      const hasValidExtension = allowedExtensions.some((ext) =>
        iconName.toLowerCase().endsWith(ext)
      );
      if (!hasValidExtension) {
        return new Response('File not found', { status: 404 });
      }

      // Use absolute path and restrict to icons directory
      const filePath = `/storage/icons/${iconName}`;

      try {
        const file = Bun.file(filePath);
        const exists = await file.exists();
        if (!exists) {
          return new Response('File not found', { status: 404 });
        }
        return new Response(file);
      } catch (error) {
        return new Response('Error serving file', { status: 500 });
      }
    },

    '/api/host': {
      async GET(req) {
        const auth = requireAuthKey(req);
        if (auth) return auth;

        return Response.json(
          (await getHosts()).map((host) => ({ ...host, webhookSecret: undefined }))
        );
      },
    },

    '/api/host/:host': {
      async POST(req, server) {
        server.timeout(req, 10);
        const auth = requireAuthKey(req);
        if (auth) return auth;

        return Response.json(await postHost({ name: req.params.host, ...(await req.json()) }));
      },

      async PUT(req, server) {
        server.timeout(req, 10);
        const auth = requireAuthKey(req);
        if (auth) return auth;

        return Response.json(await putHost({ name: req.params.host, ...(await req.json()) }));
      },

      async DELETE(req) {
        const auth = requireAuthKey(req);
        if (auth) return auth;

        return Response.json(await deleteHost({ name: req.params.host } as Host));
      },
    },

    '/api/host/:host/logs': {
      async GET(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        return Response.json(await logDb.getByHostId(selectedHost.id));
      },
    },

    '/api/host/:host/jobs': {
      async GET(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        return Response.json(await jobDb.getJobsWithLogs(selectedHost.id));
      },
    },

    '/api/host/:host/containers': {
      async GET(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        const sort = (new URL(req.url).searchParams.get('sort') ?? 'updates') as SortOptions;
        return Response.json(await getContainers(selectedHost, sort));
      },

      async DELETE(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        const cleanupLogs = await containersCleanup(selectedHost.name);

        let logs: string | any[] = 'Done';
        if (cleanupLogs.length) {
          cleanupLogs.forEach((log) => logDb.create({ hostId: selectedHost.id, ...log }));
          logs = cleanupLogs.map((log) => log.msg).join('\n');
        }

        return new Response(logs);
      },
    },

    '/api/host/:host/container/:containerId': {
      async POST(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        const containerId = req.params.containerId;
        if (!isValidContainerIdOrName(containerId)) {
          return new Response('Invalid container ID or name', { status: 400 });
        }

        return dockerExec.restartOrStopContainer(selectedHost.name, containerId, 'restart');
      },

      async PUT(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        const containerId = req.params.containerId;
        if (!isValidContainerIdOrName(containerId)) {
          return new Response('Invalid container ID or name', { status: 400 });
        }

        return dockerExec.restartOrStopContainer(selectedHost.name, containerId, 'stop');
      },

      async DELETE(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        const containerId = req.params.containerId;
        if (!isValidContainerIdOrName(containerId)) {
          return new Response('Invalid container ID or name', { status: 400 });
        }

        return dockerExec.restartOrStopContainer(selectedHost.name, containerId, 'remove');
      },
    },

    '/api/host/:host/image/:imageId': {
      async DELETE(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        const imageId = req.params.imageId;
        if (!isValidContainerIdOrName(imageId)) {
          return new Response('Invalid image ID or name', { status: 400 });
        }

        return dockerExec.removeImage(selectedHost.name, imageId);
      },
    },

    '/api/host/:host/compose': {
      async GET(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        return Response.json(
          await findComposeFiles(
            selectedHost.name,
            selectedHost.sshHost,
            selectedHost.workingFolder
          )
        );
      },

      async POST(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        const data = await req.json();
        const { composeError, composeFile } = await resolveAndValidateComposeFile(
          selectedHost,
          data
        );
        if (composeError) return composeError;

        return dockerExec.startCompose(selectedHost.name, selectedHost.sshHost, composeFile);
      },

      async PUT(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        const data = await req.json();
        const { composeError, composeFile } = await resolveAndValidateComposeFile(
          selectedHost,
          data
        );
        if (composeError) return composeError;

        return dockerExec.restartCompose(selectedHost.name, selectedHost.sshHost, composeFile);
      },

      async DELETE(req) {
        const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
        if (error) return error;

        const data = await req.json();
        const { composeError, composeFile } = await resolveAndValidateComposeFile(
          selectedHost,
          data
        );
        if (composeError) return composeError;

        return dockerExec.stopCompose(selectedHost.name, selectedHost.sshHost, composeFile);
      },
    },

    '/api/job/:id': {
      async POST(req) {
        const auth = requireAuthKey(req);
        if (auth) return auth;

        restartJob(req.params.id);

        return Response.json({ message: 'job restarted' });
      },
    },
  },

  ...serverOptions,
});

console.log(`🚀 Server running at ${server.url}`);

const webhookServer = serve({
  port: 3001,
  routes: {
    '/api/webhook/github/host/:host': {
      async POST(req) {
        const selectedHost = await host.getByName(req.params.host);
        if (!selectedHost) {
          return new Response('Not Found', { status: 404 });
        }

        const signature = req.headers.get('x-hub-signature-256');
        if (!signature) {
          return new Response('Unauthorized (no signature)', { status: 401 });
        }

        const bodyBuffer = new Uint8Array(await req.arrayBuffer());
        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(selectedHost.webhookSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signatureBuffer = await crypto.subtle.sign('HMAC', key, bodyBuffer);
        const hash = Array.from(new Uint8Array(signatureBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const expectedSignature = `sha256=${hash}`;

        if (signature !== expectedSignature) {
          return new Response('Unauthorized (bad signature)', { status: 401 });
        }

        const webhookData = JSON.parse(new TextDecoder().decode(bodyBuffer));
        const webhookEvent: GitHubWebhookEvent = {
          sender: webhookData.sender?.login,
          repo: webhookData.repository.full_name,
          number: webhookData.pull_request?.number,
          action: webhookData.action,
          merged: webhookData.pull_request?.merged,
          title: webhookData.pull_request?.title,
        };

        const foundHosts = await host.getAllByRepo(webhookEvent.repo);
        if (!foundHosts?.length) {
          return new Response('Host not found', { status: 404 });
        }

        for (const foundHost of foundHosts) {
          githubWebhookHandler(webhookEvent, foundHost);
        }

        return Response.json({ message: 'webhook received' });
      },
    },
  },

  ...serverOptions,
});

console.log(`⤷ webhook server running at ${webhookServer.url}`);
