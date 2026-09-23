import { logger } from '../../config/logger.js';

// Resend's HTTPS API, not SMTP: Railway blocks outbound SMTP ports entirely
// (confirmed via ENETUNREACH/timeout against Gmail), so a real mail send
// here has to go over plain HTTPS instead.
const RESEND_API_URL = 'https://api.resend.com/emails';

// Resend's shared sending domain -- works with zero setup (no DNS records
// to verify), at the cost of the "from" address being resend.dev instead of
// salesmore.pl. Switch to a salesmore.pl address once that domain is
// verified in the Resend dashboard.
const FROM_ADDRESS = 'Sales&More LLM <onboarding@resend.dev>';

// Best-effort only: the message is already persisted in support_messages
// before this runs, so a mail failure never loses the report -- it's just
// not surfaced by email until RESEND_API_KEY/SUPPORT_NOTIFY_EMAIL are set.
export async function notifySupportByEmail({ message, fromEmail, conversationId }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SUPPORT_NOTIFY_EMAIL;
  if (!apiKey || !to) return false;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        reply_to: fromEmail,
        subject: 'Nowa wiadomość z formularza kontaktu z supportem',
        text: [
          `Od: ${fromEmail}`,
          conversationId ? `Rozmowa: ${conversationId}` : null,
          '',
          message,
        ].filter(Boolean).join('\n'),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      logger.error('Failed to send support notification email', { status: res.status, body: await res.text() });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('Failed to send support notification email', { error: err.message });
    return false;
  }
}
