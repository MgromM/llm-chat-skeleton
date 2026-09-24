import { logger } from '../../config/logger.js';

// Resend's HTTPS API, not SMTP: Railway blocks outbound SMTP ports entirely
// (confirmed via ENETUNREACH/timeout against Gmail), so a real mail send
// here has to go over plain HTTPS instead.
const RESEND_API_URL = 'https://api.resend.com/emails';

// Resend's shared sending domain -- works with zero setup (no DNS records
// to verify), at the cost of the "from" address being resend.dev instead of
// your own domain. Switch to your own address once that domain is verified
// in the Resend dashboard.
const FROM_ADDRESS = 'LLM App <onboarding@resend.dev>';

/**
 * Shared best-effort mail sender for every internal notification (support
 * contact form, leak alerts, ...). Every caller already persists whatever
 * it's notifying about before calling this, so a failure here just means
 * the notification isn't surfaced by email -- never a lost report. Returns
 * false (never throws) if RESEND_API_KEY is unset or the send fails.
 */
export async function sendNotificationEmail({ to, subject, text, replyTo, context }) {
  const apiKey = process.env.RESEND_API_KEY;
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
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        text,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      logger.error('Failed to send notification email', { context, status: res.status, body: await res.text() });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('Failed to send notification email', { context, error: err.message });
    return false;
  }
}
