import { PROVIDERS } from "./llm/providers";

export const DATA_SNAPSHOT_SCHEMA = "12wy-tracker.local-data";
export const DATA_SNAPSHOT_VERSION = 1;

export interface LocalDataSnapshot {
  schema: typeof DATA_SNAPSHOT_SCHEMA;
  version: typeof DATA_SNAPSHOT_VERSION;
  exported_at: string;
  source_profile: {
    id: string;
    name: string;
  };
  local_settings: Record<string, string>;
  db_settings: Record<string, string>;
  tables: {
    goals: Record<string, unknown>[];
    check_items: Record<string, unknown>[];
    daily_entries: Record<string, unknown>[];
    daily_meta: Record<string, unknown>[];
    weekly_reviews: Record<string, unknown>[];
    llm_usage: Record<string, unknown>[];
  };
}

type DbLike = {
  select<T>(sql: string, bindValues?: unknown[]): Promise<T>;
  execute(sql: string, bindValues?: unknown[]): Promise<{ lastInsertId?: number }>;
};

const SAFE_LOCAL_KEYS = [
  "rtas_lang",
  "theme_mode",
  "llm_active_provider",
  "llm_budget_daily_usd",
  "llm_budget_monthly_usd",
];

export function parseSnapshotJson(text: string): LocalDataSnapshot {
  const parsed = JSON.parse(text);
  if (!isLocalDataSnapshot(parsed)) {
    throw new Error("Invalid 12wy-tracker data snapshot");
  }
  return parsed;
}

export function isLocalDataSnapshot(value: unknown): value is LocalDataSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<LocalDataSnapshot>;
  return (
    snapshot.schema === DATA_SNAPSHOT_SCHEMA &&
    snapshot.version === DATA_SNAPSHOT_VERSION &&
    typeof snapshot.exported_at === "string" &&
    isRecord(snapshot.source_profile) &&
    typeof snapshot.source_profile.id === "string" &&
    typeof snapshot.source_profile.name === "string" &&
    isRecord(snapshot.local_settings) &&
    isRecord(snapshot.db_settings) &&
    isRecord(snapshot.tables) &&
    Array.isArray(snapshot.tables.goals) &&
    Array.isArray(snapshot.tables.check_items) &&
    Array.isArray(snapshot.tables.daily_entries) &&
    Array.isArray(snapshot.tables.daily_meta) &&
    Array.isArray(snapshot.tables.weekly_reviews) &&
    Array.isArray(snapshot.tables.llm_usage)
  );
}

export function sanitizeSettingsForExport(settings: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !isSecretSettingKey(key))
  );
}

export function isSecretSettingKey(key: string): boolean {
  return /(^|[_:-])(api[_-]?key|secret|token|password)([_:-]|$)/i.test(key)
    || /^llm_key_/i.test(key);
}

export function collectSafeLocalSettings(profileId: string, storage: Storage = localStorage): Record<string, string> {
  const result: Record<string, string> = {};
  const allowed = new Set([
    ...SAFE_LOCAL_KEYS,
    `${profileId}:program_start`,
    `${profileId}:program_end`,
    ...PROVIDERS.map((p) => `llm_active_model_${p.id}`),
  ]);
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !allowed.has(key) || isSecretSettingKey(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) result[key] = value;
  }
  for (const key of allowed) {
    const value = storage.getItem(key);
    if (value !== null && !isSecretSettingKey(key)) result[key] = value;
  }
  return result;
}

export function applySafeLocalSettings(settings: Record<string, string>, storage: Storage = localStorage): void {
  for (const [key, value] of Object.entries(sanitizeSettingsForExport(settings))) {
    storage.setItem(key, value);
  }
}

export async function createLocalDataSnapshot(): Promise<LocalDataSnapshot> {
  const [{ getDb }, { activeProfile }] = await Promise.all([
    import("./db"),
    import("./profile"),
  ]);
  const db = await getDb();
  const profile = activeProfile();
  const dbSettings = await selectDbSettings(db);

  return {
    schema: DATA_SNAPSHOT_SCHEMA,
    version: DATA_SNAPSHOT_VERSION,
    exported_at: new Date().toISOString(),
    source_profile: profile,
    local_settings: collectSafeLocalSettings(profile.id),
    db_settings: dbSettings,
    tables: {
      goals: await db.select<Record<string, unknown>[]>(
        "SELECT * FROM goals WHERE profile_id = $1 AND deleted_at IS NULL ORDER BY sort_order, id",
        [profile.id]
      ),
      check_items: await db.select<Record<string, unknown>[]>(
        `SELECT ci.* FROM check_items ci
         JOIN goals g ON g.id = ci.goal_id
         WHERE g.profile_id = $1 AND g.deleted_at IS NULL AND ci.deleted_at IS NULL
         ORDER BY ci.sort_order, ci.id`,
        [profile.id]
      ),
      daily_entries: await db.select<Record<string, unknown>[]>(
        `SELECT de.* FROM daily_entries de
         JOIN check_items ci ON ci.id = de.check_item_id
         JOIN goals g ON g.id = ci.goal_id
         WHERE g.profile_id = $1
           AND g.deleted_at IS NULL
           AND ci.deleted_at IS NULL
           AND de.deleted_at IS NULL
         ORDER BY de.date, de.check_item_id`,
        [profile.id]
      ),
      daily_meta: await db.select<Record<string, unknown>[]>(
        "SELECT * FROM daily_meta WHERE profile_id = $1 AND deleted_at IS NULL ORDER BY date",
        [profile.id]
      ),
      weekly_reviews: await db.select<Record<string, unknown>[]>(
        "SELECT * FROM weekly_reviews WHERE profile_id = $1 AND deleted_at IS NULL ORDER BY week_number",
        [profile.id]
      ),
      llm_usage: await db.select<Record<string, unknown>[]>(
        "SELECT * FROM llm_usage WHERE profile_id = $1 ORDER BY id",
        [profile.id]
      ),
    },
  };
}

export async function importLocalDataSnapshot(snapshot: LocalDataSnapshot): Promise<void> {
  if (!isLocalDataSnapshot(snapshot)) {
    throw new Error("Invalid 12wy-tracker data snapshot");
  }

  const [{ getDb }, { activeProfile }] = await Promise.all([
    import("./db"),
    import("./profile"),
  ]);
  const db = await getDb();
  const profile = activeProfile();
  await replaceActiveProfileDatabaseData(db, profile.id, snapshot);
  applySafeLocalSettings(remapProfileLocalSettings(snapshot.local_settings, snapshot.source_profile.id, profile.id));
}

export async function deleteActiveProfileLocalData(): Promise<void> {
  const [{ getDb }, { activeProfile }] = await Promise.all([
    import("./db"),
    import("./profile"),
  ]);
  const db = await getDb();
  const profile = activeProfile();
  await clearActiveProfileDatabaseData(db, profile.id);
  removeProfileLocalSettings(profile.id);
}

export function downloadSnapshot(snapshot: LocalDataSnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `12wy-tracker-${snapshot.source_profile.id}-${snapshot.exported_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function dataLocationLabel(): string {
  return "Local desktop store + active-profile settings";
}

async function selectDbSettings(db: DbLike): Promise<Record<string, string>> {
  try {
    const rows = await db.select<{ key: string; value: string }[]>("SELECT key, value FROM settings ORDER BY key");
    return sanitizeSettingsForExport(Object.fromEntries(rows.map((row) => [row.key, row.value])));
  } catch {
    return {};
  }
}

async function replaceActiveProfileDatabaseData(
  db: DbLike,
  profileId: string,
  snapshot: LocalDataSnapshot
): Promise<void> {
  await clearActiveProfileDatabaseData(db, profileId);

  const goalIdMap = new Map<number, number>();
  for (const sourceGoal of snapshot.tables.goals) {
    const oldId = Number(sourceGoal.id);
    const result = await insertRow(db, "goals", {
      ...sourceGoal,
      profile_id: profileId,
    }, ["id"]);
    if (Number.isFinite(oldId) && result.lastInsertId !== undefined) {
      goalIdMap.set(oldId, result.lastInsertId);
    }
  }

  const checkItemIdMap = new Map<number, number>();
  for (const sourceItem of snapshot.tables.check_items) {
    const oldId = Number(sourceItem.id);
    const oldGoalId = Number(sourceItem.goal_id);
    const goalId = goalIdMap.get(oldGoalId);
    if (!goalId) continue;
    const result = await insertRow(db, "check_items", {
      ...sourceItem,
      goal_id: goalId,
    }, ["id"]);
    if (Number.isFinite(oldId) && result.lastInsertId !== undefined) {
      checkItemIdMap.set(oldId, result.lastInsertId);
    }
  }

  for (const sourceEntry of snapshot.tables.daily_entries) {
    const oldCheckItemId = Number(sourceEntry.check_item_id);
    const checkItemId = checkItemIdMap.get(oldCheckItemId);
    if (!checkItemId) continue;
    await insertRow(db, "daily_entries", {
      ...sourceEntry,
      check_item_id: checkItemId,
    }, []);
  }

  for (const sourceMeta of snapshot.tables.daily_meta) {
    await insertRow(db, "daily_meta", {
      ...sourceMeta,
      profile_id: profileId,
    }, []);
  }

  for (const sourceReview of snapshot.tables.weekly_reviews) {
    await insertRow(db, "weekly_reviews", {
      ...sourceReview,
      profile_id: profileId,
    }, ["id"]);
  }

  for (const sourceUsage of snapshot.tables.llm_usage) {
    await insertRow(db, "llm_usage", {
      ...sourceUsage,
      profile_id: profileId,
    }, ["id"]);
  }

  for (const [key, value] of Object.entries(snapshot.db_settings)) {
    if (isSecretSettingKey(key)) continue;
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  }
}

async function clearActiveProfileDatabaseData(db: DbLike, profileId: string): Promise<void> {
  await db.execute(
    `DELETE FROM daily_entries
     WHERE check_item_id IN (
       SELECT ci.id FROM check_items ci
       JOIN goals g ON g.id = ci.goal_id
       WHERE g.profile_id = $1
     )`,
    [profileId]
  );
  await db.execute(
    `DELETE FROM check_items
     WHERE goal_id IN (SELECT id FROM goals WHERE profile_id = $1)`,
    [profileId]
  );
  await db.execute("DELETE FROM daily_meta WHERE profile_id = $1", [profileId]);
  await db.execute("DELETE FROM weekly_reviews WHERE profile_id = $1", [profileId]);
  await db.execute("DELETE FROM goals WHERE profile_id = $1", [profileId]);
  await db.execute("DELETE FROM llm_usage WHERE profile_id = $1", [profileId]);
}

async function insertRow(
  db: DbLike,
  table: string,
  row: Record<string, unknown>,
  omit: string[]
): Promise<{ lastInsertId?: number }> {
  const omitSet = new Set(omit);
  const columns = Object.keys(row)
    .filter((key) => !omitSet.has(key) && row[key] !== undefined);
  if (columns.length === 0) return {};
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
  const values = columns.map((key) => row[key]);
  return await db.execute(
    `INSERT INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`,
    values
  );
}

function remapProfileLocalSettings(
  settings: Record<string, string>,
  sourceProfileId: string,
  targetProfileId: string
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith(`${sourceProfileId}:`)) {
      result[`${targetProfileId}:${key.slice(sourceProfileId.length + 1)}`] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

function removeProfileLocalSettings(profileId: string): void {
  const prefix = `${profileId}:`;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
