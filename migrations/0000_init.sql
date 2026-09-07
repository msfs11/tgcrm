-- Leads: system of record + chat_id <-> topic_id mappings
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  user_chat_id TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT,
  username TEXT,
  first_name TEXT,
  last_name TEXT,

  source TEXT,
  business_type TEXT,
  request_type TEXT,

  topic_id INTEGER UNIQUE,
  status TEXT NOT NULL DEFAULT 'new',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leads_topic_id
ON leads(topic_id);

-- Transient qualification state (mostly for free-text "Other" answers)
CREATE TABLE IF NOT EXISTS lead_drafts (
  user_chat_id TEXT PRIMARY KEY,
  source TEXT,
  business_type TEXT,
  request_type TEXT,
  awaiting TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);