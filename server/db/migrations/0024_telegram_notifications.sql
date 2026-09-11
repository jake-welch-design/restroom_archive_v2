-- Admin notifications move from ntfy to a Telegram bot.
--
-- ntfy meters anonymous publishes per source IP, and a Cloudflare Worker sends
-- from Cloudflare's shared egress pool, so delivery depended on other tenants'
-- traffic. Telegram meters per bot token, which only this archive holds.
--
-- `telegram_chat_id` is where a linked admin's messages go. TEXT rather than
-- INTEGER: Telegram documents chat ids as up to 52 significant bits, and
-- keeping them as strings means no layer between here and the API can round
-- one through a float.
--
-- `telegram_name` is the linked account's @username (or first name when it
-- has none), stored only so the settings row can say which account is linked.
--
-- `telegram_link_code` and `telegram_link_code_at` hold the one-time code an
-- admin sends the bot to prove the chat is theirs, and when it was issued.
-- Both are cleared once the link succeeds.
ALTER TABLE users ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE users ADD COLUMN telegram_name TEXT;
ALTER TABLE users ADD COLUMN telegram_link_code TEXT;
ALTER TABLE users ADD COLUMN telegram_link_code_at TEXT;

-- No admin has a Telegram chat yet, so any existing opt-in now points at
-- nowhere. Clearing it keeps the invariant the settings route enforces --
-- notifications cannot be on without a destination -- and means turning them
-- back on is an explicit act after linking, never a carry-over.
UPDATE users SET admin_notify_at = NULL;

ALTER TABLE users DROP COLUMN ntfy_topic;
