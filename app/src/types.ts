export type CheckItemType = "bool" | "number" | "minutes" | "choice" | "scale" | "text";

export interface Goal {
  id: number;
  uuid?: string | null;
  profile_id?: string;
  name: string;
  description: string;
  why: string;
  target_text: string;
  weight: number;
  active: number;
  sort_order: number;
  persona: string | null;
  context_json: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  device_id?: string | null;
  sync_version?: number | null;
}

/** AI-suggested goal coach setup: persona + the fields to ask the user for. */
export interface GoalCoachSetup {
  persona: string;
  fields: GoalContextField[];
}

export type GoalContextFieldType = "text" | "number" | "scale" | "choice" | "bool" | "long_text";

export interface GoalContextField {
  key: string;
  label: string;
  type: GoalContextFieldType;
  hint?: string;
  unit?: string;
  options?: string[];
}

export interface CheckItem {
  id: number;
  uuid?: string | null;
  goal_id: number;
  label: string;
  type: CheckItemType;
  target_value: number | null;
  unit: string | null;
  options: string | null;
  sort_order: number;
  active: number;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  device_id?: string | null;
  sync_version?: number | null;
}

export interface DailyEntry {
  uuid?: string | null;
  date: string;
  check_item_id: number;
  value_num: number | null;
  value_text: string | null;
  value_bool: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  device_id?: string | null;
  sync_version?: number | null;
}

export interface DailyMeta {
  uuid?: string | null;
  profile_id?: string;
  date: string;
  week_number: number;
  top_priority: string;
  sleep_hours: number | null;
  hrv: number | null;
  energy_morning: number | null;
  energy_night: number | null;
  mood: number | null;
  reflection_good: string;
  reflection_bad: string;
  reflection_tomorrow: string;
  daily_score: number | null;
  execution_rate: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  device_id?: string | null;
  sync_version?: number | null;
}

export function emptyMeta(date: string, week: number): DailyMeta {
  return {
    date,
    week_number: week,
    top_priority: "",
    sleep_hours: null,
    hrv: null,
    energy_morning: null,
    energy_night: null,
    mood: null,
    reflection_good: "",
    reflection_bad: "",
    reflection_tomorrow: "",
    daily_score: null,
    execution_rate: null,
  };
}

export interface WeeklyReview {
  id: number;
  uuid?: string | null;
  profile_id?: string;
  week_number: number;
  went_well: string;
  to_improve: string;
  next_focus: string;
  next_top_priority: string;
  self_score: number | null;
  execution_score: number | null;
  ai_suggestion: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  device_id?: string | null;
  sync_version?: number | null;
}

export function emptyWeeklyReview(week: number): WeeklyReview {
  return {
    id: 0,
    week_number: week,
    went_well: "",
    to_improve: "",
    next_focus: "",
    next_top_priority: "",
    self_score: null,
    execution_score: null,
    ai_suggestion: null,
  };
}

export interface SuggestedCheckItem {
  label: string;
  type: CheckItemType;
  target_value?: number;
  unit?: string;
  options?: string[];
}

export interface GoalDesignSuggestion {
  description?: string;
  why?: string;
  target_text: string;
  weight?: number;
  items: SuggestedCheckItem[];
}
