import { sendNotificationEmail } from '../notifications/resendMailer.js';

// Best-effort only: the message is already persisted in support_messages
// before this runs, so a mail failure never loses the report -- it's just
// not surfaced by email until RESEND_API_KEY/SUPPORT_NOTIFY_EMAIL are set.
export async function notifySupportByEmail({ message, fromEmail, conversationId }) {
  const to = process.env.SUPPORT_NOTIFY_EMAIL;
  return sendNotificationEmail({
    to,
    replyTo: fromEmail,
    subject: 'Nowa wiadomość z formularza kontaktu z supportem',
    text: [
      `Od: ${fromEmail}`,
      conversationId ? `Rozmowa: ${conversationId}` : null,
      '',
      message,
    ].filter(Boolean).join('\n'),
    context: 'support-message',
  });
}
