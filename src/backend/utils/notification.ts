import { createExec } from '@/backend/utils/exec';
import { mainLogger } from '@/backend/utils/logger';

const event = 'notification';
const logger = mainLogger.child({ event });
const exec = createExec(logger);

const bashEscapeSingleQuoted = (content: string) => `'${content.replace(/'/g, "'\\''")}'`;

export const sendNotification = async ({
  hostName,
  subject,
  message,
}: {
  hostName: string;
  subject: string;
  message: string;
}) => {
  const { APP_URL, APPRISE_NOTIFICATION } = process.env;

  if (!APP_URL || !APPRISE_NOTIFICATION) {
    const message =
      'Skipping notification due to missing Apprise or app URL configuration. See: .env.default';
    logger.warn(message);
    return message;
  }

  try {
    const whichCmd = await exec.run('which apprise');
    if (whichCmd.code > 0) {
      throw new Error('Apprise is not installed', { cause: whichCmd });
    }

    subject = `${subject} - Containers Up!`;
    message = `${message}\n\n[View on Containers Up! dashboard](${APP_URL}/?host=${hostName})`;
    const info = await exec.run(`apprise -vv \
      --input-format markdown \
      --title ${bashEscapeSingleQuoted(subject)} \
      --body ${bashEscapeSingleQuoted(message)} \
      ${bashEscapeSingleQuoted(APPRISE_NOTIFICATION)}
    `);

    return info;
  } catch (err) {
    const msg = 'Error sending notification';
    logger.error(err, msg);
    return err?.message ? `${msg}: ${err?.message}` : err;
  }
};
