import { join } from 'node:path';
import { type ErrorLike, serve } from 'bun';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { host } from '@/backend/db/host';
import { job as jobDb } from '@/backend/db/job';
import { log as logDb } from '@/backend/db/log';
import type { Host } from '@/backend/db/schema/host';
import { JobStatus } from '@/backend/db/schema/job';
import { findNonRunningComposeFiles } from '@/backend/endpoints/compose';
import { getContainers, type SortOptions } from '@/backend/endpoints/containers';
import { containersCleanup } from '@/backend/endpoints/containers-cleanup';
import { deleteHost, getHosts, postHost, putHost } from '@/backend/endpoints/host';
import { restartJob } from '@/backend/endpoints/jobs';
import { checkHostForImageUpdates } from '@/backend/endpoints/update-check';
import { forgejoWebhookHandler } from '@/backend/endpoints/webhook/forgejo';
import { githubWebhookHandler } from '@/backend/endpoints/webhook/github';
import { handleWebhookRequest } from '@/backend/endpoints/webhook/request-handler';
import { isValidContainerIdOrName } from '@/backend/utils';
import { createDockerExec } from '@/backend/utils/docker';
import { mainLogger } from '@/backend/utils/logger';
import { sendNotification } from '@/backend/utils/notification';
import index from '@/index.html';

const dockerExec = createDockerExec(mainLogger);

const ENV_PUBLIC_OIDC_ISSUER_URI = process.env.ENV_PUBLIC_OIDC_ISSUER_URI;
const ENV_PUBLIC_OIDC_CLIENT_ID = process.env.ENV_PUBLIC_OIDC_CLIENT_ID;
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const OIDC_JWKS_URL =
  process.env.OIDC_JWKS_URL ||
  (ENV_PUBLIC_OIDC_ISSUER_URI && join(ENV_PUBLIC_OIDC_ISSUER_URI, '.well-known/jwks.json'));

const isOidcEnabled = Boolean(ENV_PUBLIC_OIDC_ISSUER_URI && ENV_PUBLIC_OIDC_CLIENT_ID);

const isDev = process.env.NODE_ENV !== 'production';

let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
if (isOidcEnabled && OIDC_JWKS_URL) {
  try {
    JWKS = createRemoteJWKSet(new URL(OIDC_JWKS_URL));
  } catch (err) {
    mainLogger.error(err, 'Invalid OIDC_JWKS_URL');
  }
}

const requireOidc = async (req: Request) => {
  if (!isOidcEnabled) return null;
  const authz = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authz || !authz.toLowerCase().startsWith('bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const token = authz.slice(7).trim();
  try {
    if (!JWKS) {
      mainLogger.error('JWKS not configured');
      return new Response('Server OIDC JWKS not configured', { status: 500 });
    }
    await jwtVerify(token, JWKS, {
      issuer: ENV_PUBLIC_OIDC_ISSUER_URI,
      audience: ENV_PUBLIC_OIDC_CLIENT_ID,
    });
    // Optional: restrict by email/domain/groups in the future
    return null;
  } catch (err) {
    if (err.message.startsWith('Expected 200 OK')) {
      mainLogger.error(err, `Upstream OIDC metadata fetch failed`); // Log upstream error
      return new Response(`Upstream: ${err.message}`, { status: 502 });
    }

    mainLogger.error(err, 'Invalid OIDC token');
    return new Response('Unauthorized', { status: 401 });
  }
};

const getAuthorizedHost = async (
  req: Request,
  repoHost: string
): Promise<{ error?: Response; selectedHost?: Host }> => {
  const auth = await requireOidc(req);
  if (auth) return { error: auth };

  const selectedHost = await host.getByName(repoHost);
  if (!selectedHost) {
    return { error: new Response('Host not found', { status: 404 }) };
  }
  return { selectedHost };
};

const resolveAndValidateComposeFile = async (
  selectedHost: Host,
  data: { composeFile?: string }
) => {
  if (!data.composeFile) throw new Error('composeFile is required');
  const composeFile = data.composeFile.startsWith('/')
    ? data.composeFile
    : `${selectedHost.workingFolder}/${data.composeFile}`;
  if (await dockerExec.isInvalidComposeFile(selectedHost, composeFile)) {
    return {
      composeError: Response.json({ error: 'Invalid or missing compose file' }, { status: 400 }),
    };
  }
  return { composeFile };
};

const serverOptions = {
  idleTimeout: 30,

  error(error: ErrorLike & { stderr?: string }) {
    return Response.json(
      {
        error: error.message || 'Internal server error',
        ...(isDev && {
          stack: error.stack,
          details: error.stderr,
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

  development: isDev && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
};

export const startServer = () => {
  const server = serve({
    routes: {
      ...(isDev
        ? // Serve index.html for all unmatched routes.
          { '/*': index }
        : {
            '/*': async (req: Request) => {
              const url = new URL(req.url);
              const path = join(import.meta.dir, url.pathname);
              const file = Bun.file(path);
              if ((await file.exists()) && url.pathname !== '/index.html') {
                return new Response(file);
              }

              // Read index.html
              const htmlBundle = Bun.file(join(import.meta.dir, 'index.html'));

              // Inject environment variables
              const html = (await htmlBundle.text())
                .replace(/%ENV_PUBLIC_OIDC_ISSUER_URI%/g, `${ENV_PUBLIC_OIDC_ISSUER_URI || ''}`)
                .replace(/%ENV_PUBLIC_OIDC_CLIENT_ID%/g, `${ENV_PUBLIC_OIDC_CLIENT_ID || ''}`);

              return new Response(html, {
                headers: { 'Content-Type': 'text/html' },
              });
            },
          }),

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
          const auth = await requireOidc(req);
          if (auth) return auth;

          return Response.json(
            (await getHosts()).map((host) => ({ ...host, webhookSecret: undefined }))
          );
        },
      },

      '/api/host/:host': {
        async POST(req, server) {
          server.timeout(req, 10);
          const auth = await requireOidc(req);
          if (auth) return auth;

          return Response.json(await postHost({ name: req.params.host, ...(await req.json()) }));
        },

        async PUT(req, server) {
          server.timeout(req, 10);
          const auth = await requireOidc(req);
          if (auth) return auth;

          return Response.json(await putHost({ name: req.params.host, ...(await req.json()) }));
        },

        async DELETE(req) {
          const auth = await requireOidc(req);
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
            cleanupLogs.forEach(
              async (log) => await logDb.create({ hostId: selectedHost.id, ...log })
            );
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

          return dockerExec.restartStopOrDeleteContainer(selectedHost.name, containerId, 'restart');
        },

        async PUT(req) {
          const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
          if (error) return error;

          const containerId = req.params.containerId;
          if (!isValidContainerIdOrName(containerId)) {
            return new Response('Invalid container ID or name', { status: 400 });
          }

          return dockerExec.restartStopOrDeleteContainer(selectedHost.name, containerId, 'stop');
        },

        async DELETE(req) {
          const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
          if (error) return error;

          const containerId = req.params.containerId;
          if (!isValidContainerIdOrName(containerId)) {
            return new Response('Invalid container ID or name', { status: 400 });
          }

          return dockerExec.restartStopOrDeleteContainer(selectedHost.name, containerId, 'rm');
        },
      },

      '/api/host/:host/container/:containerId/logs': {
        async GET(req) {
          const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
          if (error) return error;

          const containerId = req.params.containerId;
          if (!isValidContainerIdOrName(containerId)) {
            return new Response('Invalid container ID or name', { status: 400 });
          }

          return dockerExec.streamContainerLogs(selectedHost.name, containerId);
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

          return Response.json(await findNonRunningComposeFiles(selectedHost));
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

          if (data.jobTitle) {
            jobDb.upsert({
              hostId: selectedHost.id,
              folder: data.jobFolder,
              title: data.jobTitle,
              status: JobStatus.completed,
            });
          }

          return dockerExec.restartCompose(
            selectedHost.name,
            selectedHost.sshHost,
            composeFile,
            Boolean(data.pullFirst)
          );
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

      '/api/host/:host/update': {
        async POST(req) {
          const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
          if (error) return error;

          const data = await req.json();
          checkHostForImageUpdates(selectedHost, data.checkService);

          return new Response('Triggered update check');
        },
      },

      '/api/host/:host/notification/test': {
        async POST(req) {
          const { error, selectedHost } = await getAuthorizedHost(req, req.params.host);
          if (error) return error;

          return Response.json(
            await sendNotification({
              hostName: selectedHost.name,
              subject: 'Test notification',
              message:
                'This is a test notification from Containers Up! to make sure everything is working correctly.',
            })
          );
        },
      },

      '/api/job/:id': {
        async POST(req) {
          const auth = await requireOidc(req);
          if (auth) return auth;

          restartJob(req.params.id);

          return Response.json({ message: 'job restarted' });
        },

        async PATCH(req) {
          const auth = await requireOidc(req);
          if (auth) return auth;

          await jobDb.markJobAsComplete(req.params.id);

          return new Response('Marked as complete');
        },
      },

      '/api/auth/token': {
        async POST(req) {
          if (
            !isOidcEnabled ||
            !ENV_PUBLIC_OIDC_ISSUER_URI ||
            !ENV_PUBLIC_OIDC_CLIENT_ID ||
            !OIDC_CLIENT_SECRET
          ) {
            mainLogger.error('OIDC not fully configured on server');
            return new Response('OIDC not fully configured on server', {
              status: 400,
            });
          }

          const formData = await req.formData();

          const data: any = {};
          for (const [key, value] of formData.entries()) {
            data[key] = value;
          }

          const { code, code_verifier, redirect_uri, client_id } = data;

          if (!code || !code_verifier || !redirect_uri || !client_id) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
          }

          try {
            // Fetch OIDC metadata to get the token_endpoint
            const metadataUrl = `${ENV_PUBLIC_OIDC_ISSUER_URI.replace(
              /\/$/,
              ''
            )}/.well-known/openid-configuration`;
            const metadataRes = await fetch(metadataUrl);
            if (!metadataRes.ok) {
              mainLogger.error(`Failed to fetch OIDC metadata: ${metadataRes.statusText}`);
              return Response.json({ error: `Failed to fetch OIDC metadata` }, { status: 500 });
            }
            const metadata = await metadataRes.json();
            const tokenEndpoint = metadata.token_endpoint;

            if (!tokenEndpoint) {
              mainLogger.error('Token endpoint not found in OIDC metadata');
              return Response.json(
                { error: 'Token endpoint not found in OIDC metadata' },
                { status: 500 }
              );
            }

            const params = new URLSearchParams();
            params.append('grant_type', 'authorization_code');
            params.append('code', code);
            params.append('redirect_uri', redirect_uri);
            params.append('client_id', client_id);
            params.append('code_verifier', code_verifier);
            params.append('client_secret', OIDC_CLIENT_SECRET);

            const tokenRes = await fetch(tokenEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: params.toString(),
            });

            if (!tokenRes.ok) {
              const errorBodyText = await tokenRes.text(); // Get text first
              try {
                const errorBody = JSON.parse(errorBodyText); // Try parsing as JSON
                mainLogger.error(errorBody, 'OIDC token exchange failed (upstream error)');
                return Response.json(
                  { error: 'OIDC token exchange failed (upstream error)' },
                  {
                    status: tokenRes.status,
                  }
                );
              } catch {
                // If not JSON, return as plain text error
                mainLogger.error(
                  `OIDC token exchange failed (upstream non-JSON error): ${errorBodyText}`
                );
                return Response.json(
                  { error: 'OIDC token exchange failed (upstream non-JSON error)' },
                  {
                    status: tokenRes.status,
                  }
                );
              }
            }

            const tokenData = await tokenRes.json();
            return Response.json(tokenData);
          } catch (error) {
            mainLogger.error(error, 'Error during OIDC token exchange');
            return Response.json(
              { error: 'Internal server error during token exchange' },
              { status: 500 }
            );
          }
        },
      },

      '/api/auth/metadata': {
        async GET() {
          if (!ENV_PUBLIC_OIDC_ISSUER_URI) {
            return new Response('OIDC not configured', { status: 400 });
          }
          try {
            const url = `${ENV_PUBLIC_OIDC_ISSUER_URI.replace(
              /\/$/,
              ''
            )}/.well-known/openid-configuration`;
            const upstream = await fetch(url);
            if (!upstream.ok) {
              mainLogger.error(
                `Upstream OIDC metadata fetch failed: ${upstream.status} ${upstream.statusText}`
              ); // Log upstream error
              return new Response(
                `Could not reach the OpenID Connect provider. Upstream: ${upstream.status}`,
                { status: 502 }
              );
            }
            const body = await upstream.json();
            return Response.json(body);
          } catch (error) {
            mainLogger.error(error, 'Failed to fetch OIDC metadata'); // Log general error
            return new Response(
              'Could not reach the OpenID Connect provider. Failed to fetch OIDC metadata',
              { status: 502 }
            );
          }
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
          return handleWebhookRequest(req, req.params.host, {
            handler: githubWebhookHandler,
            name: 'GitHub',
          });
        },
      },

      '/api/webhook/forgejo/host/:host': {
        async POST(req) {
          return handleWebhookRequest(req, req.params.host, {
            handler: forgejoWebhookHandler,
            name: 'Forgejo',
          });
        },
      },
    },

    ...serverOptions,
  });

  console.log(`⤷ webhook server running at ${webhookServer.url}`);
};
