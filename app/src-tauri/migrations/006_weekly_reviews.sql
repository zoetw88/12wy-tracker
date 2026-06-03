-- v6: weekly review records

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT,
  profile_id TEXT NOT NULL DEFAULT 'default',
  week_number INTEGER NOT NULL,
  went_well TEXT,
  to_improve TEXT,
  next_focus TEXT,
  next_top_priority TEXT,
  self_score INTEGER,
  execution_score REAL,
  ai_suggestion TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  device_id TEXT NOT NULL DEFAULT 'local',
  sync_version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reviews_unique
  ON weekly_reviews(profile_id, week_number)
  WHERE deleted_at IS NULL;
