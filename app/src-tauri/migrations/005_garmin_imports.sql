-- v5: external health imports and parsed Garmin metrics

CREATE TABLE IF NOT EXISTS external_sources (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL DEFAULT 'default',
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  session_path TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  device_id TEXT NOT NULL DEFAULT 'local',
  sync_version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_sources_provider
  ON external_sources(profile_id, provider)
  WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO external_sources (id, profile_id, provider, display_name, status)
VALUES ('garmin_default', 'default', 'garmin', 'Garmin Connect', 'manual_session');

CREATE TABLE IF NOT EXISTS garmin_raw_imports (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL DEFAULT 'default',
  run_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  requested_url TEXT,
  final_url TEXT,
  title TEXT,
  data_date TEXT,
  signed_in INTEGER NOT NULL DEFAULT 0,
  text_content TEXT,
  raw_json TEXT NOT NULL,
  screenshot_path TEXT,
  text_path TEXT,
  collected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  parser_version TEXT NOT NULL DEFAULT 'garmin_raw_v1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  device_id TEXT NOT NULL DEFAULT 'local',
  sync_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_garmin_raw_imports_run ON garmin_raw_imports(run_id, page_name);
CREATE INDEX IF NOT EXISTS idx_garmin_raw_imports_profile_date ON garmin_raw_imports(profile_id, data_date, collected_at);

CREATE TABLE IF NOT EXISTS health_daily_metrics (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL DEFAULT 'default',
  source TEXT NOT NULL,
  metric_date TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  value_num REAL,
  value_text TEXT,
  unit TEXT,
  raw_import_id TEXT REFERENCES garmin_raw_imports(id),
  confidence REAL NOT NULL DEFAULT 0.6,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  device_id TEXT NOT NULL DEFAULT 'local',
  sync_version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_daily_metrics_unique
  ON health_daily_metrics(profile_id, source, metric_date, metric_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_health_daily_metrics_date
  ON health_daily_metrics(profile_id, metric_date, source);

CREATE TABLE IF NOT EXISTS health_activities (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL DEFAULT 'default',
  source TEXT NOT NULL,
  source_activity_id TEXT,
  activity_date TEXT NOT NULL,
  name TEXT,
  sport_type TEXT,
  distance_km REAL,
  duration_min REAL,
  avg_hr INTEGER,
  calories REAL,
  raw_text TEXT,
  raw_import_id TEXT REFERENCES garmin_raw_imports(id),
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  device_id TEXT NOT NULL DEFAULT 'local',
  sync_version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_activities_unique
  ON health_activities(profile_id, source, source_activity_id)
  WHERE source_activity_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_health_activities_date
  ON health_activities(profile_id, activity_date, source);
