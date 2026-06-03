-- v4: sync-ready local schema foundation

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  program_start TEXT NOT NULL DEFAULT '2026-05-26',
  program_end TEXT NOT NULL DEFAULT '2026-08-17',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  device_id TEXT NOT NULL DEFAULT 'local',
  sync_version INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO profiles (id, name, program_start, program_end, device_id)
VALUES ('default', '主線', '2026-05-26', '2026-08-17', 'local');

ALTER TABLE goals ADD COLUMN uuid TEXT;
ALTER TABLE goals ADD COLUMN updated_at TEXT;
ALTER TABLE goals ADD COLUMN deleted_at TEXT;
ALTER TABLE goals ADD COLUMN device_id TEXT NOT NULL DEFAULT 'local';
ALTER TABLE goals ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
UPDATE goals SET uuid = 'goal_' || id WHERE uuid IS NULL;
UPDATE goals SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_uuid ON goals(uuid);
CREATE INDEX IF NOT EXISTS idx_goals_sync ON goals(profile_id, deleted_at, updated_at);

ALTER TABLE check_items ADD COLUMN uuid TEXT;
ALTER TABLE check_items ADD COLUMN updated_at TEXT;
ALTER TABLE check_items ADD COLUMN deleted_at TEXT;
ALTER TABLE check_items ADD COLUMN device_id TEXT NOT NULL DEFAULT 'local';
ALTER TABLE check_items ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
UPDATE check_items SET uuid = 'check_' || id WHERE uuid IS NULL;
UPDATE check_items SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_check_items_uuid ON check_items(uuid);
CREATE INDEX IF NOT EXISTS idx_check_items_sync ON check_items(deleted_at, updated_at);

ALTER TABLE daily_entries ADD COLUMN uuid TEXT;
ALTER TABLE daily_entries ADD COLUMN created_at TEXT;
ALTER TABLE daily_entries ADD COLUMN deleted_at TEXT;
ALTER TABLE daily_entries ADD COLUMN device_id TEXT NOT NULL DEFAULT 'local';
ALTER TABLE daily_entries ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
UPDATE daily_entries SET uuid = 'entry_' || date || '_' || check_item_id WHERE uuid IS NULL;
UPDATE daily_entries SET created_at = COALESCE(updated_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_entries_uuid ON daily_entries(uuid);
CREATE INDEX IF NOT EXISTS idx_daily_entries_sync ON daily_entries(deleted_at, updated_at);

ALTER TABLE daily_meta ADD COLUMN uuid TEXT;
ALTER TABLE daily_meta ADD COLUMN created_at TEXT;
ALTER TABLE daily_meta ADD COLUMN deleted_at TEXT;
ALTER TABLE daily_meta ADD COLUMN device_id TEXT NOT NULL DEFAULT 'local';
ALTER TABLE daily_meta ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
UPDATE daily_meta SET uuid = 'meta_' || profile_id || '_' || date WHERE uuid IS NULL;
UPDATE daily_meta SET created_at = COALESCE(updated_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_meta_uuid ON daily_meta(uuid);
CREATE INDEX IF NOT EXISTS idx_daily_meta_sync ON daily_meta(profile_id, deleted_at, updated_at);

CREATE TABLE IF NOT EXISTS local_changes (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at TEXT,
  device_id TEXT NOT NULL DEFAULT 'local'
);

CREATE INDEX IF NOT EXISTS idx_local_changes_unsynced ON local_changes(synced_at, changed_at);
CREATE INDEX IF NOT EXISTS idx_local_changes_entity ON local_changes(entity, entity_id);

ALTER TABLE llm_usage ADD COLUMN request_id TEXT;
ALTER TABLE llm_usage ADD COLUMN profile_id TEXT;
ALTER TABLE llm_usage ADD COLUMN scenario TEXT;
ALTER TABLE llm_usage ADD COLUMN prompt_version TEXT;
ALTER TABLE llm_usage ADD COLUMN input_chars INTEGER;
ALTER TABLE llm_usage ADD COLUMN output_chars INTEGER;
ALTER TABLE llm_usage ADD COLUMN quality_score REAL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_profile_ts ON llm_usage(profile_id, ts);
CREATE INDEX IF NOT EXISTS idx_llm_usage_scenario ON llm_usage(scenario, prompt_key, model);
