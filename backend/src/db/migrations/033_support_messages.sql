-- "Contact support" form (frontend/src/components/SupportContactModal.tsx):
-- messages land here regardless of whether outbound email delivery
-- (SUPPORT_NOTIFY_EMAIL / SMTP_*) is configured, so nothing is lost if
-- mailing isn't set up yet.
CREATE TABLE IF NOT EXISTS support_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  message TEXT NOT NULL,
  conversation_id INTEGER REFERENCES conversations(id),
  email_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
