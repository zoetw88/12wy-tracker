/**
 * dateUtils — program range helpers.
 *
 * NULL-PROPAGATION CONTRACT
 * ─────────────────────────
 * • programStart() / programEnd() return string | null.
 *   null means the active profile has no saved range.
 * • hasProgramRange() returns true iff BOTH keys exist for the active profile.
 * • Math helpers (weekNumber, weekRange, daysSinceStart, daysUntilEnd,
 *   daysUntilWeekEnds) ASSUME a valid range exists.
 *   Callers MUST guard with `if (hasProgramRange()) { … }` before calling them.
 *   Violating this contract will throw or return nonsensical values.
 * • DEFAULT_PROGRAM_START / DEFAULT_PROGRAM_END are exported ONLY as
 *   suggested placeholder values for the Settings date picker UI.
 *   They are NOT returned as silent fallbacks by programStart()/programEnd().
 */
import { profileKey } from "./profile";

export const DEFAULT_PROGRAM_START = "2026-05-26";
export const DEFAULT_PROGRAM_END = "2026-08-17";
export const TOTAL_WEEKS = 12;
const START_KEY = "program_start";
const END_KEY = "program_end";
export const PROGRAM_RANGE_EVENT = "program-range-change";

/** Returns the stored program start for the active profile, or null if not set. */
export function programStart(): string | null {
  return localStorage.getItem(profileKey(START_KEY));
}

/** Returns the stored program end for the active profile, or null if not set. */
export function programEnd(): string | null {
  return localStorage.getItem(profileKey(END_KEY));
}

/**
 * True iff both program_start and program_end are stored for the active profile.
 * Guard all math helpers with this check.
 */
export function hasProgramRange(): boolean {
  return (
    localStorage.getItem(profileKey(START_KEY)) !== null &&
    localStorage.getItem(profileKey(END_KEY)) !== null
  );
}

export function setProgramRange(start: string, end: string) {
  localStorage.setItem(profileKey(START_KEY), start);
  localStorage.setItem(profileKey(END_KEY), end);
  window.dispatchEvent(new CustomEvent(PROGRAM_RANGE_EVENT));
}

export function defaultEndForStart(start: string): string {
  const d = new Date(start + "T00:00:00");
  d.setDate(d.getDate() + totalDays() - 1);
  return toISO(d);
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Week number of `date` within the program (1–12).
 * REQUIRES hasProgramRange() === true.
 */
export function weekNumber(date: string): number {
  const start = new Date(programStart()! + "T00:00:00");
  const d = new Date(date + "T00:00:00");
  const diffDays = Math.floor((d.getTime() - start.getTime()) / 86400000);
  if (diffDays < 0) return 1;
  return Math.min(TOTAL_WEEKS, Math.floor(diffDays / 7) + 1);
}

/**
 * ISO date range for `week` (1-based).
 * REQUIRES hasProgramRange() === true.
 */
export function weekRange(week: number): { start: string; end: string } {
  const start = new Date(programStart()! + "T00:00:00");
  start.setDate(start.getDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toISO(start), end: toISO(end) };
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Days elapsed since program start (1-based).
 * REQUIRES hasProgramRange() === true.
 */
export function daysSinceStart(date: string): number {
  const start = new Date(programStart()! + "T00:00:00");
  const d = new Date(date + "T00:00:00");
  return Math.floor((d.getTime() - start.getTime()) / 86400000) + 1;
}

export function totalDays(): number {
  return 84;
}

/**
 * Days remaining until program end (≥ 0).
 * REQUIRES hasProgramRange() === true.
 */
export function daysUntilEnd(): number {
  const end = new Date(programEnd()! + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / 86400000));
}

/**
 * Days from `today` until the last day of `week` (≥ 0, clamped at 0 for past weeks).
 * REQUIRES hasProgramRange() === true.
 * Used for the "X 天後可回顧" hint (AC4).
 */
export function daysUntilWeekEnds(week: number, today: string): number {
  const wr = weekRange(week);
  const endDate = new Date(wr.end + "T00:00:00");
  const todayDate = new Date(today + "T00:00:00");
  return Math.max(0, Math.round((endDate.getTime() - todayDate.getTime()) / 86400000));
}
