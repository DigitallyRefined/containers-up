import nodemailer from 'nodemailer';
import { marked } from 'marked';
import removeMd from 'remove-markdown';

export const sendNotification = async ({
  hostName,
  subject,
  message,
}: {
  hostName: string;
  subject: string;
  message: string;
}) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_TO, APP_URL } =
    process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM || !SMTP_TO || !APP_URL) {
    const message = 'Skipping notification due to missing SMTP configuration. See: .env.default';
    console.warn(message);
    return message;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true', // upgrade later with STARTTLS
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  subject = `${subject} - Containers Up!`;
  const fullUrl = `${APP_URL}/?host=${hostName}`;
  const htmlMessage = await marked.parse(
    `${message}\n\n[View on Containers Up! dashboard](${fullUrl})`
  );
  const textMessage = removeMd(`${message}\n\nView on Containers Up! dashboard: ${fullUrl}`);

  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: SMTP_TO,
      subject,
      text: textMessage,
      html: htmlMessage,
    });

    return info;
  } catch (err) {
    console.error('Error while sending mail', err);
    return err?.message || err;
  }
};
