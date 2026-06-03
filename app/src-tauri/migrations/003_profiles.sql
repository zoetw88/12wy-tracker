-- v3: profile-aware goals and daily meta

ALTER TABLE goals ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE daily_meta RENAME TO daily_meta_old;

CREATE TABLE daily_meta (
  profile_id TEXT NOT NULL DEFAULT 'default',
  date TEXT NOT NULL,
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
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (profile_id, date)
);

INSERT INTO daily_meta (
  profile_id, date, week_number, top_priority, sleep_hours, hrv,
  energy_morning, energy_night, mood,
  reflection_good, reflection_bad, reflection_tomorrow,
  daily_score, execution_rate, updated_at
)
SELECT
  'default', date, week_number, top_priority, sleep_hours, hrv,
  energy_morning, energy_night, mood,
  reflection_good, reflection_bad, reflection_tomorrow,
  daily_score, execution_rate, updated_at
FROM daily_meta_old;

DROP TABLE daily_meta_old;

CREATE INDEX IF NOT EXISTS idx_goals_profile ON goals(profile_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_daily_meta_profile_date ON daily_meta(profile_id, date);
