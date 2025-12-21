import type { Host } from '@/backend/db/schema/host';
import { commonWebhookHandler, type WebhookEvent } from '@/backend/endpoints/webhook/common';

export const baseEvent = 'github-webhook';

export type GitHubWebhookEvent = WebhookEvent;

export const getDependabotRepoFolder = (title: string) => {
  // Extract folder from title (like sed -E 's/.* in (.*)/\1/')
  // Dependabot format: "Bump ... in /folder" (folder maybe empty if watching a single file)
  const folderMatch = title.match(/ in (.*)/);
  return folderMatch ? folderMatch[1] : null;
};

export const githubWebhookHandler = async (webhookEvent: GitHubWebhookEvent, hostConfig: Host) => {
  return commonWebhookHandler(webhookEvent, hostConfig, {
    eventName: baseEvent,
    folder:
      hostConfig.botType === 'dependabot' ? getDependabotRepoFolder(webhookEvent.title) : null,
  });
};
