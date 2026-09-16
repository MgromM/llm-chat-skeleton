-- Web search citations (url/title) attached to an assistant reply, so the
-- frontend can render sources instead of the user only seeing bare prose
-- with no indication the model looked anything up.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS citations JSONB;
