import Database from "@tauri-apps/plugin-sql";
import { Goal, CheckItem, DailyEntry, DailyMeta, emptyMeta, WeeklyReview } from "./types";
import { weekNumber, hasProgramRange } from "./dateUtils";
import { activeProfileId } from "./profile";

let dbPromise: Promise<Database> | null = null;
export function getDb(): Promise<Database> {
  if (!dbPromise) dbPromise = Database.load("sqlite:twelvewy.db");
  return dbPromise;
}

type ChangeOperation = "create" | "update" | "delete" | "upsert";

function newEntityId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${randomId}`;
}

async function recordLocalChange(
  db: Database,
  entity: string,
  entityId: string | number,
  operation: ChangeOperation,
  payload: unknown
): Promise<void> {
  await db.execute(
    `INSERT INTO local_changes (id, entity, entity_id, operation, payload_json, device_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      newEntityId("change"),
      entity,
      String(entityId),
      operation,
      JSON.stringify(payload),
      "local",
    ]
  );
}

// ---------- Goals ----------
export async function listGoals(activeOnly = false): Promise<Goal[]> {
  const db = await getDb();
  const profileId = activeProfileId();
  const where = activeOnly
    ? "WHERE profile_id = $1 AND active = 1 AND deleted_at IS NULL"
    : "WHERE profile_id = $1 AND deleted_at IS NULL";
  return await db.select<Goal[]>(
    `SELECT * FROM goals ${where} ORDER BY sort_order, id`,
    [profileId]
  );
}

export async function getGoal(id: number): Promise<Goal | null> {
  const db = await getDb();
  const rows = await db.select<Goal[]>(
    "SELECT * FROM goals WHERE id = $1 AND profile_id = $2 AND deleted_at IS NULL",
    [id, activeProfileId()]
  );
  return rows[0] ?? null;
}

export async function createGoal(
  g: Omit<Goal, "id">
): Promise<number> {
  const db = await getDb();
  const uuid = newEntityId("goal");
  const r = await db.execute(
    `INSERT INTO goals (uuid, profile_id, name, description, why, target_text, weight, active,
                        sort_order, persona, context_json, updated_at, device_id, sync_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP,$12,1)`,
    [uuid, activeProfileId(), g.name, g.description, g.why, g.target_text, g.weight, g.active,
     g.sort_order, g.persona ?? null, g.context_json ?? null, "local"]
  );
  const id = r.lastInsertId as number;
  await recordLocalChange(db, "goal", uuid, "create", { ...g, id, uuid, profile_id: activeProfileId() });
  return id;
}

export async function updateGoal(g: Goal): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE goals SET name=$1, description=$2, why=$3, target_text=$4,
     weight=$5, active=$6, sort_order=$7, persona=$8, context_json=$9,
     updated_at=CURRENT_TIMESTAMP, sync_version=sync_version + 1
     WHERE id=$10 AND profile_id=$11 AND deleted_at IS NULL`,
    [g.name, g.description, g.why, g.target_text, g.weight, g.active,
     g.sort_order, g.persona ?? null, g.context_json ?? null, g.id, activeProfileId()]
  );
  await recordLocalChange(db, "goal", g.uuid ?? g.id, "update", { ...g, profile_id: activeProfileId() });
}

export async function updateGoalCoach(
  id: number, persona: string, context_json: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE goals SET persona = $1, context_json = $2,
       updated_at=CURRENT_TIMESTAMP, sync_version=sync_version + 1
     WHERE id = $3 AND profile_id = $4 AND deleted_at IS NULL`,
    [persona, context_json, id, activeProfileId()]
  );
  await recordLocalChange(db, "goal", id, "update", { id, persona, context_json, profile_id: activeProfileId() });
}

export async function deleteGoal(id: number): Promise<void> {
  const db = await getDb();
  const profileId = activeProfileId();
  const deletedAt = new Date().toISOString();
  await db.execute(
    `UPDATE daily_entries
     SET deleted_at = $1, updated_at = CURRENT_TIMESTAMP, sync_version = sync_version + 1
     WHERE check_item_id IN (
       SELECT ci.id FROM check_items ci
       JOIN goals g ON g.id = ci.goal_id
       WHERE g.id = $2 AND g.profile_id = $3
     )`,
    [deletedAt, id, profileId]
  );
  await db.execute(
    `UPDATE check_items
     SET deleted_at = $1, updated_at = CURRENT_TIMESTAMP, sync_version = sync_version + 1
     WHERE goal_id IN (SELECT id FROM goals WHERE id = $2 AND profile_id = $3)`,
    [deletedAt, id, profileId]
  );
  await db.execute(
    `UPDATE goals
     SET deleted_at = $1, updated_at = CURRENT_TIMESTAMP, sync_version = sync_version + 1
     WHERE id = $2 AND profile_id = $3`,
    [deletedAt, id, profileId]
  );
  await recordLocalChange(db, "goal", id, "delete", { id, profile_id: profileId, deleted_at: deletedAt });
}

// ---------- Check items ----------
export async function listCheckItems(
  goalId?: number,
  activeOnly = false
): Promise<CheckItem[]> {
  const db = await getDb();
  const where: string[] = [];
  const args: any[] = [];
  if (goalId !== undefined) {
    where.push(`goal_id = $${args.length + 1}`);
    args.push(goalId);
  }
  if (activeOnly) where.push("active = 1");
  where.push("deleted_at IS NULL");
  where.push(`goal_id IN (SELECT id FROM goals WHERE profile_id = $${args.length + 1} AND deleted_at IS NULL)`);
  args.push(activeProfileId());
  return await db.select<CheckItem[]>(
    `SELECT * FROM check_items ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY sort_order, id`,
    args
  );
}

export async function createCheckItem(
  c: Omit<CheckItem, "id">
): Promise<number> {
  const db = await getDb();
  const owner = await db.select<{ id: number }[]>(
    "SELECT id FROM goals WHERE id = $1 AND profile_id = $2 AND deleted_at IS NULL",
    [c.goal_id, activeProfileId()]
  );
  if (owner.length === 0) throw new Error("目標不屬於目前 profile");
  const uuid = newEntityId("check");
  const r = await db.execute(
    `INSERT INTO check_items (uuid, goal_id, label, type, target_value, unit, options, sort_order, active,
                              updated_at, device_id, sync_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,$10,1)`,
    [uuid, c.goal_id, c.label, c.type, c.target_value, c.unit, c.options, c.sort_order, c.active, "local"]
  );
  const id = r.lastInsertId as number;
  await recordLocalChange(db, "check_item", uuid, "create", { ...c, id, uuid, profile_id: activeProfileId() });
  return id;
}

export async function updateCheckItem(c: CheckItem): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE check_items SET label=$1, type=$2, target_value=$3, unit=$4,
       options=$5, sort_order=$6, active=$7,
       updated_at=CURRENT_TIMESTAMP, sync_version=sync_version + 1
     WHERE id=$8
       AND deleted_at IS NULL
       AND goal_id IN (SELECT id FROM goals WHERE profile_id=$9 AND deleted_at IS NULL)`,
    [c.label, c.type, c.target_value, c.unit, c.options, c.sort_order, c.active, c.id, activeProfileId()]
  );
  await recordLocalChange(db, "check_item", c.uuid ?? c.id, "update", { ...c, profile_id: activeProfileId() });
}

export async function deleteCheckItem(id: number): Promise<void> {
  const db = await getDb();
  const profileId = activeProfileId();
  const deletedAt = new Date().toISOString();
  await db.execute(
    `UPDATE daily_entries
     SET deleted_at = $1, updated_at = CURRENT_TIMESTAMP, sync_version = sync_version + 1
     WHERE check_item_id IN (
       SELECT ci.id FROM check_items ci
       JOIN goals g ON g.id = ci.goal_id
       WHERE ci.id = $2 AND g.profile_id = $3
     )`,
    [deletedAt, id, profileId]
  );
  await db.execute(
    `UPDATE check_items
     SET deleted_at = $1, updated_at = CURRENT_TIMESTAMP, sync_version = sync_version + 1
     WHERE id = $2 AND goal_id IN (SELECT id FROM goals WHERE profile_id = $3 AND deleted_at IS NULL)`,
    [deletedAt, id, profileId]
  );
  await recordLocalChange(db, "check_item", id, "delete", { id, profile_id: profileId, deleted_at: deletedAt });
}

// ---------- Daily entries ----------
export async function listEntriesForDate(date: string): Promise<DailyEntry[]> {
  const db = await getDb();
  return await db.select<DailyEntry[]>(
    `SELECT de.* FROM daily_entries de
     JOIN check_items ci ON ci.id = de.check_item_id
     JOIN goals g ON g.id = ci.goal_id
     WHERE de.date = $1
       AND de.deleted_at IS NULL
       AND ci.deleted_at IS NULL
       AND g.deleted_at IS NULL
       AND g.profile_id = $2`,
    [date, activeProfileId()]
  );
}

export async function upsertEntry(e: DailyEntry): Promise<void> {
  const db = await getDb();
  const owner = await db.select<{ id: number }[]>(
    `SELECT ci.id FROM check_items ci
     JOIN goals g ON g.id = ci.goal_id
     WHERE ci.id = $1
       AND ci.deleted_at IS NULL
       AND g.deleted_at IS NULL
       AND g.profile_id = $2`,
    [e.check_item_id, activeProfileId()]
  );
  if (owner.length === 0) throw new Error("項目不屬於目前 profile");
  const uuid = newEntityId("entry");
  await db.execute(
    `INSERT INTO daily_entries (uuid, date, check_item_id, value_num, value_text, value_bool,
                                created_at, updated_at, device_id, sync_version)
     VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$7,1)
     ON CONFLICT(date, check_item_id) DO UPDATE SET
       value_num=excluded.value_num,
       value_text=excluded.value_text,
       value_bool=excluded.value_bool,
       deleted_at=NULL,
       updated_at=CURRENT_TIMESTAMP,
       sync_version=daily_entries.sync_version + 1`,
    [uuid, e.date, e.check_item_id, e.value_num, e.value_text, e.value_bool, "local"]
  );
  await recordLocalChange(db, "daily_entry", `${e.date}:${e.check_item_id}`, "upsert", {
    ...e,
    profile_id: activeProfileId(),
  });
}

export async function listEntriesInRange(
  start: string,
  end: string
): Promise<DailyEntry[]> {
  const db = await getDb();
  return await db.select<DailyEntry[]>(
    `SELECT de.* FROM daily_entries de
     JOIN check_items ci ON ci.id = de.check_item_id
     JOIN goals g ON g.id = ci.goal_id
     WHERE de.date BETWEEN $1 AND $2
       AND de.deleted_at IS NULL
       AND ci.deleted_at IS NULL
       AND g.deleted_at IS NULL
       AND g.profile_id = $3
     ORDER BY de.date`,
    [start, end, activeProfileId()]
  );
}

// ---------- Daily meta ----------
export async function loadMeta(date: string): Promise<DailyMeta> {
  const db = await getDb();
  const rows = await db.select<DailyMeta[]>(
    "SELECT * FROM daily_meta WHERE profile_id = $1 AND date = $2 AND deleted_at IS NULL",
    [activeProfileId(), date]
  );
  if (rows.length === 0) return emptyMeta(date, hasProgramRange() ? weekNumber(date) : 0);
  return rows[0];
}

export async function saveMeta(m: DailyMeta): Promise<void> {
  const db = await getDb();
  const profileId = activeProfileId();
  const uuid = newEntityId("meta");
  await db.execute(
    `INSERT INTO daily_meta (
       uuid, profile_id, date, week_number, top_priority, sleep_hours, hrv,
       energy_morning, energy_night, mood,
       reflection_good, reflection_bad, reflection_tomorrow,
       daily_score, execution_rate, created_at, updated_at, device_id, sync_version
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$16,1)
     ON CONFLICT(profile_id, date) DO UPDATE SET
       week_number=excluded.week_number,
       top_priority=excluded.top_priority,
       sleep_hours=excluded.sleep_hours,
       hrv=excluded.hrv,
       energy_morning=excluded.energy_morning,
       energy_night=excluded.energy_night,
       mood=excluded.mood,
       reflection_good=excluded.reflection_good,
       reflection_bad=excluded.reflection_bad,
       reflection_tomorrow=excluded.reflection_tomorrow,
       daily_score=excluded.daily_score,
       execution_rate=excluded.execution_rate,
       deleted_at=NULL,
       updated_at=CURRENT_TIMESTAMP,
       sync_version=daily_meta.sync_version + 1`,
    [
      uuid, profileId, m.date, m.week_number, m.top_priority, m.sleep_hours, m.hrv,
      m.energy_morning, m.energy_night, m.mood,
      m.reflection_good, m.reflection_bad, m.reflection_tomorrow,
      m.daily_score, m.execution_rate, "local",
    ]
  );
  await recordLocalChange(db, "daily_meta", `${profileId}:${m.date}`, "upsert", {
    ...m,
    profile_id: profileId,
  });
}

export async function listMetaInRange(start: string, end: string): Promise<DailyMeta[]> {
  const db = await getDb();
  return await db.select<DailyMeta[]>(
    "SELECT * FROM daily_meta WHERE profile_id = $1 AND date BETWEEN $2 AND $3 AND deleted_at IS NULL ORDER BY date",
    [activeProfileId(), start, end]
  );
}

export async function listAllMeta(): Promise<DailyMeta[]> {
  const db = await getDb();
  return await db.select<DailyMeta[]>(
    "SELECT * FROM daily_meta WHERE profile_id = $1 AND deleted_at IS NULL ORDER BY date DESC",
    [activeProfileId()]
  );
}

export async function deleteProfileData(profileId: string): Promise<void> {
  const db = await getDb();
  const deletedAt = new Date().toISOString();
  await db.execute(
    `UPDATE daily_entries
     SET deleted_at = $1, updated_at = CURRENT_TIMESTAMP, sync_version = sync_version + 1
     WHERE check_item_id IN (
       SELECT ci.id FROM check_items ci
       JOIN goals g ON g.id = ci.goal_id
       WHERE g.profile_id = $2
     )`,
    [deletedAt, profileId]
  );
  await db.execute(
    `UPDATE check_items
     SET deleted_at = $1, updated_at = CURRENT_TIMESTAMP, sync_version = sync_version + 1
     WHERE goal_id IN (SELECT id FROM goals WHERE profile_id = $2)`,
    [deletedAt, profileId]
  );
  await db.execute(
    `UPDATE daily_meta
     SET deleted_at = $1, updated_at = CURRENT_TIMESTAMP, sync_version = sync_version + 1
     WHERE profile_id = $2`,
    [deletedAt, profileId]
  );
  await db.execute(
    `UPDATE goals
     SET deleted_at = $1, updated_at = CURRENT_TIMESTAMP, sync_version = sync_version + 1
     WHERE profile_id = $2`,
    [deletedAt, profileId]
  );
  await db.execute(
    `UPDATE profiles
     SET deleted_at = $1, updated_at = CURRENT_TIMESTAMP, sync_version = sync_version + 1
     WHERE id = $2`,
    [deletedAt, profileId]
  );
  await recordLocalChange(db, "profile", profileId, "delete", { id: profileId, deleted_at: deletedAt });
}

// ---------- Weekly reviews ----------
export async function getWeeklyReview(week: number): Promise<WeeklyReview | null> {
  const db = await getDb();
  const rows = await db.select<WeeklyReview[]>(
    "SELECT * FROM weekly_reviews WHERE profile_id = $1 AND week_number = $2 AND deleted_at IS NULL",
    [activeProfileId(), week]
  );
  return rows[0] ?? null;
}

export async function createWeeklyReview(r: Omit<WeeklyReview, "id">): Promise<number> {
  const db = await getDb();
  const uuid = newEntityId("review");
  const result = await db.execute(
    `INSERT INTO weekly_reviews (
       uuid, profile_id, week_number, went_well, to_improve, next_focus, next_top_priority,
       self_score, execution_score, ai_suggestion,
       created_at, updated_at, device_id, sync_version
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$11,1)`,
    [
      uuid, activeProfileId(), r.week_number, r.went_well, r.to_improve, r.next_focus,
      r.next_top_priority, r.self_score, r.execution_score, null, "local",
    ]
  );
  const id = result.lastInsertId as number;
  await recordLocalChange(db, "weekly_review", uuid, "create", { ...r, id, uuid, profile_id: activeProfileId() });
  return id;
}

export async function setWeeklyReviewAiSuggestion(id: number, text: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ uuid: string }[]>(
    "SELECT uuid FROM weekly_reviews WHERE id = $1 AND profile_id = $2 AND deleted_at IS NULL",
    [id, activeProfileId()]
  );
  const uuid = rows[0]?.uuid;
  await db.execute(
    `UPDATE weekly_reviews SET ai_suggestion=$1, updated_at=CURRENT_TIMESTAMP, sync_version=sync_version + 1
     WHERE id=$2 AND profile_id=$3 AND deleted_at IS NULL`,
    [text, id, activeProfileId()]
  );
  await recordLocalChange(db, "weekly_review", uuid ?? id, "update", { id, uuid, ai_suggestion: text, profile_id: activeProfileId() });
}

export async function listWeeklyReviews(): Promise<WeeklyReview[]> {
  const db = await getDb();
  return await db.select<WeeklyReview[]>(
    "SELECT * FROM weekly_reviews WHERE profile_id = $1 AND deleted_at IS NULL ORDER BY week_number",
    [activeProfileId()]
  );
}

// ---------- Settings ----------
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}
