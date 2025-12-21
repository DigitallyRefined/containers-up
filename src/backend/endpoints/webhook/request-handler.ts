import { host } from '@/backend/db/host';
import { log as logDb } from '@/backend/db/log';
import type { WebhookEvent } from '@/backend/endpoints/webhook/common';
import { mainLogger } from '@/backend/utils/logger';

type WebhookRouteOptions = {
  handler: (event: WebhookEvent, hostConfig: any) => Promise<void>;
  name: string; // for logging ('GitHub' or 'Forgejo')
};

export const handleWebhookRequest = async (
  req: Request,
  hostParam: string,
  options: WebhookRouteOptions
) => {
  const selectedHost = await host.getByName(hostParam);
  if (!selectedHost) {
    return new Response('Host not found', { status: 404 });
  }

  // Check headers for signature
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

  // Validate signature
  if (signature !== `sha256=${hash}`) {
    return new Response('Unauthorized (bad signature)', { status: 401 });
  }

  const json = new TextDecoder().decode(bodyBuffer);
  let webhookData: Record<string, any> | undefined;
  if (!json) {
    return Response.json({ message: 'JSON payload is empty' }, { status: 400 });
  }
  try {
    webhookData = JSON.parse(json);
  } catch {
    // Basic ping check for GitHub
    if (json.includes('Speak+like+a+human')) {
      const msg = `${options.name} webhook ping received for host: ${selectedHost.name}`;
      mainLogger.info(msg);
      logDb.create({
        hostId: selectedHost.id,
        level: 30,
        time: Date.now(),
        event: `${options.name} webhook ping`,
        msg,
      });
      return Response.json({ message: 'webhook ping received' });
    }
    return Response.json({ message: 'Invalid JSON payload', json }, { status: 400 });
  }

  const webhookEvent: WebhookEvent = {
    sender: webhookData.sender?.login,
    repo: webhookData.repository.full_name,
    number: webhookData.pull_request?.number,
    action: webhookData.action,
    merged: webhookData.pull_request?.merged,
    title: webhookData.pull_request?.title,
    body: webhookData.pull_request?.body,
    labels: webhookData.pull_request?.labels,
    url: webhookData.pull_request?.html_url,
  };

  // Check Pull Request Labels
  if (selectedHost.botType === 'dependabot') {
    const isDockerComposePr = webhookEvent.labels?.some((label) => label.name === 'docker_compose');
    if (!isDockerComposePr) {
      return Response.json({ message: 'Not a Docker Compose PR' }, { status: 400 });
    }
  }

  options.handler(webhookEvent, selectedHost);

  return Response.json({ message: 'webhook received' });
};
