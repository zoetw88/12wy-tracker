// Source integrations stubbed in the open-source shell.
// All export names, signatures, and return shapes are preserved so callers
// compile without modification. Runtime functions return no-op / empty results.

export function getScriptPath(): string {
  return localStorage.getItem("strava_script_path") ?? "";
}
export function setScriptPath(p: string): void {
  localStorage.setItem("strava_script_path", p);
}

export interface SyncResult {
  success: boolean;
  inserted: number;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function runStravaSync(_days: number): Promise<SyncResult> {
  return {
    success: false,
    inserted: 0,
    stdout: "",
    stderr: "Strava integration not configured in the open-source shell.",
    exitCode: null,
  };
}

export async function runStravaStatus(): Promise<string> {
  return "Strava integration not configured in the open-source shell.";
}

// ---------- DB queries ----------

export interface StravaActivity {
  activity_id: number;
  date: string;
  type: string | null;
  sport_type: string | null;
  name: string | null;
  duration_min: number | null;
  distance_km: number | null;
  elev_gain_m: number | null;
  calories: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  start_local: string | null;
}

export interface StravaSyncLogRow {
  id: number;
  synced_at: string;
  days: number;
  inserted: number | null;
  success: number;
  error: string | null;
}

export async function listActivitiesInRange(_start: string, _end: string): Promise<StravaActivity[]> {
  return [];
}

export async function lastSyncLog(): Promise<StravaSyncLogRow | null> {
  return null;
}

export async function activitiesCount(): Promise<number> {
  return 0;
}
