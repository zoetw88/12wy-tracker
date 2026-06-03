-- Dynamic goal-based schema

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  why TEXT,
  target_text TEXT,
  weight INTEGER DEFAULT 25,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS check_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL,         -- 'bool' | 'number' | 'minutes' | 'choice' | 'scale' | 'text'
  target_value REAL,           -- daily target (e.g. 5 for "5 problems")
  unit TEXT,                   -- 'problems' / 'min' / 'chunks' etc.
  options TEXT,                -- JSON array for choice type
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_check_items_goal ON check_items(goal_id, active);

CREATE TABLE IF NOT EXISTS daily_entries (
  date TEXT NOT NULL,
  check_item_id INTEGER NOT NULL REFERENCES check_items(id) ON DELETE CASCADE,
  value_num REAL,
  value_text TEXT,
  value_bool INTEGER,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (date, check_item_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_entries_date ON daily_entries(date);

CREATE TABLE IF NOT EXISTS daily_meta (
  date TEXT PRIMARY KEY,
  week_number INTEGER,
  top_priority TEXT,
  sleep_hours REAL,
  hrv INTEGER,
  energy_morning INTEGER,
  energy_night INTEGER,
  mood INTEGER,
  reflection_good TEXT,
  reflection_bad TEXT,
  reflection_tomorrow TEXT,
  daily_score INTEGER,
  execution_rate REAL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS llm_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT CURRENT_TIMESTAMP,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_key TEXT,                -- 'suggest_items' | 'daily_review' | 'weekly_review' | 'test'
  system_prompt TEXT,
  user_prompt TEXT,
  response_text TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  cost_usd REAL,
  success INTEGER DEFAULT 1,
  error_msg TEXT
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_ts ON llm_usage(ts);
CREATE INDEX IF NOT EXISTS idx_llm_usage_provider ON llm_usage(provider, model);
