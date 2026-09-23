import nodemailer from 'nodemailer';
import { logger } from '../../config/logger.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    // Some PaaS hosts block outbound SMTP ports entirely, which otherwise
    // hangs the connection for nodemailer's ~2min default timeouts -- fail
    // fast instead, since this is best-effort on top of the DB write anyway.
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 8_000,
  });
  return transporter;
}

// Best-effort only: the message is already persisted in support_messages
// before this runs, so a mail failure never loses the report -- it's just
// not surfaced by email until SMTP_HOST/SUPPORT_NOTIFY_EMAIL are set.
export async function notifySupportByEmail({ message, fromEmail, conversationId }) {
  const to = process.env.SUPPORT_NOTIFY_EMAIL;
  const client = getTransporter();
  if (!client || !to) return false;

  try {
    await client.sendMail({
      from: process.env.SMTP_USER,
      to,
      replyTo: fromEmail,
      subject: 'Nowa wiadomość z formularza kontaktu z supportem',
      text: [
        `Od: ${fromEmail}`,
        conversationId ? `Rozmowa: ${conversationId}` : null,
        '',
        message,
      ].filter(Boolean).join('\n'),
    });
    return true;
  } catch (err) {
    logger.error('Failed to send support notification email', { error: err.message });
    return false;
  }
}
