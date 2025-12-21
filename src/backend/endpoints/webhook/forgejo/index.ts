import type { Host } from '@/backend/db/schema/host';
import { commonWebhookHandler, type WebhookEvent } from '@/backend/endpoints/webhook/common';

export const baseEvent = 'forgejo-webhook';

export type ForgejoWebhookEvent = WebhookEvent;

export const forgejoWebhookHandler = async (
  webhookEvent: ForgejoWebhookEvent,
  hostConfig: Host
) => {
  return commonWebhookHandler(webhookEvent, hostConfig, {
    eventName: baseEvent,
  });
};
