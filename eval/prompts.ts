/**
 * eval/prompts.ts — promptfoo prompt-function shim
 *
 * Imports the REAL prompt builders from the app source so eval and production
 * share exactly the same prompt text with zero drift.
 *
 * promptfoo loads this file via its bundled tsx transformer (no separate tsc step).
 * Each exported function receives a promptfoo CallApiContext and must return a
 * ChatMessage array: { role: 'system' | 'user', content: string }[]
 *
 * Types are inlined here (no @types/promptfoo package needed at scaffold time).
 */

import {
  createGoalDesignPrompt,
  priorityPrompt as buildPriorityPrompt,
  weeklyReviewPrompt as buildWeeklyReviewPrompt,
} from "../app/src/llm/prompts.ts";

import type { Goal, CheckItem, DailyEntry, DailyMeta } from "../app/src/types.ts";

// Minimal promptfoo context type — enough for our shim without installing @promptfoo/types
interface PromptContext {
  vars: Record<string, unknown>;
}

type ChatMessage = { role: "system" | "user"; content: string };

// ── 1. Goal-design prompt ──────────────────────────────────────────────────────

export function goalDesignPrompt(context: PromptContext): ChatMessage[] {
  const goal = context.vars.goal as Goal;
  const bundle = createGoalDesignPrompt(goal);
  return [
    { role: "system", content: bundle.system },
    { role: "user", content: bundle.user },
  ];
}

// ── 2. Priority prompt ─────────────────────────────────────────────────────────

export function priorityPrompt(context: PromptContext): ChatMessage[] {
  const {
    date,
    weekNumber,
    daysElapsed,
    daysRemaining,
    totalDays,
    goals,
    items,
    recentMetas,
    recentEntries,
    allEntries,
    yesterdayTomorrowNote,
    yesterdayBadNote,
  } = context.vars as {
    date: string;
    weekNumber: number;
    daysElapsed: number;
    daysRemaining: number;
    totalDays: number;
    goals: Goal[];
    items: CheckItem[];
    recentMetas: DailyMeta[];
    recentEntries: DailyEntry[];
    allEntries: DailyEntry[];
    yesterdayTomorrowNote: string;
    yesterdayBadNote: string;
  };

  const bundle = buildPriorityPrompt({
    date,
    weekNumber,
    daysElapsed,
    daysRemaining,
    totalDays,
    goals,
    items,
    recentMetas,
    recentEntries,
    allEntries,
    yesterdayTomorrowNote,
    yesterdayBadNote,
  });

  return [
    { role: "system", content: bundle.system },
    { role: "user", content: bundle.user },
  ];
}

// ── 3. Weekly-review prompt ────────────────────────────────────────────────────

export function weeklyReviewPrompt(context: PromptContext): ChatMessage[] {
  const weekly = context.vars.weekly as string;
  const bundle = buildWeeklyReviewPrompt(weekly);
  return [
    { role: "system", content: bundle.system },
    { role: "user", content: bundle.user },
  ];
}
