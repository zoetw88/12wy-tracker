// Placeholder prompts for the open-source shell — real prompts are private.
// All export names, signatures, and return shapes are preserved so callers
// compile without modification. The prompt text is intentionally generic.

import { Goal, CheckItem, DailyEntry, DailyMeta } from "../types";

export interface PromptBundle {
  system: string;
  user: string;
  responseFormat: "text" | "json";
  exampleResponse: string;
}

export interface PrioritySuggestion {
  priority: string;
  reason: string;
  tag?: string;
}

export function setupGoalCoachPrompt(_goal: Goal): PromptBundle {
  return {
    system: "You are a helpful coaching assistant.",
    user: "Design a coaching persona and background fields for this goal.",
    responseFormat: "json",
    exampleResponse: '{"persona":"You are a helpful coach.","fields":[]}',
  };
}

export function suggestItemsPrompt(_goal: Goal): PromptBundle {
  return {
    system: "You are a helpful execution coach.",
    user: "Suggest daily trackable check items for this goal.",
    responseFormat: "json",
    exampleResponse: '[]',
  };
}

export function createGoalDesignPrompt(_goal: Goal): PromptBundle {
  return {
    system: "You are a goal design assistant.",
    user: "Refine this 12-week goal into a concrete, measurable outcome.",
    responseFormat: "json",
    exampleResponse: '{"description":"","why":"","target_text":"","weight":20}',
  };
}

export function goalFieldQuestionsPrompt(_goal: Goal): PromptBundle {
  return {
    system: "You are a goal data designer.",
    user: "Determine what additional information is needed to design daily fields.",
    responseFormat: "json",
    exampleResponse: '{"questions":[]}',
  };
}

export function goalFieldItemsPrompt(_goal: Goal, _answers: Record<string, string>): PromptBundle {
  return {
    system: "You are a daily field designer.",
    user: "Design daily tracking fields for this goal based on the user's answers.",
    responseFormat: "json",
    exampleResponse: '[]',
  };
}

export function dailyReviewPrompt(_daily: string): PromptBundle {
  return {
    system: "You are a helpful daily review coach.",
    user: "Review today's progress and provide actionable feedback.",
    responseFormat: "text",
    exampleResponse: "1. Score: -/100\n2. Progress: ...\n3. Top issue: ...",
  };
}

export function weeklyReviewPrompt(_weekly: string): PromptBundle {
  return {
    system: "You are a weekly review coach.",
    user: "Analyze this week's execution and provide a structured review.",
    responseFormat: "text",
    exampleResponse: "1. Execution rate: --%\n2. Key behaviours: ...",
  };
}

export function dashboardAdvicePrompt(args: {
  week: number;
  totalWeeks: number;
  daysElapsed: number;
  daysRemaining: number;
  goals: Goal[];
  items: CheckItem[];
  metas: DailyMeta[];
  entries: DailyEntry[];
  dayScores: { date: string; score: number; meta: DailyMeta }[];
  goalWeek: { goal: Goal; avgPct: number; days: number }[];
}): PromptBundle {
  const goalLines = args.goals.map((g) => {
    const perf = args.goalWeek.find((x) => x.goal.id === g.id);
    return `- ${g.name}: target=${g.target_text || "(none)"}; why=${g.why || "(none)"}; weekly_progress=${perf?.avgPct ?? 0}% over ${perf?.days ?? 0} logged day(s)`;
  }).join("\n") || "- No active goals";
  const scoreLines = args.dayScores.slice(-7).map((d) => (
    `- ${d.date}: score=${d.score}, priority=${d.meta.top_priority || "(none)"}`
  )).join("\n") || "- No daily scores logged";
  return {
    system: "You are a strategic 12-week planning coach.",
    user: `Based on the current data, provide prioritised advice for this week.

Program:
- week: ${args.week}/${args.totalWeeks}
- days elapsed: ${args.daysElapsed}
- days remaining: ${args.daysRemaining}

Goals:
${goalLines}

Recent daily scores:
${scoreLines}

Return concise coaching advice with:
1. Biggest risk
2. Top 3 actions for the next 7 days
3. What to stop doing`,
    responseFormat: "text",
    exampleResponse: "1. Biggest risk: ...\n2. Top 3 actions: ...",
  };
}

export function priorityPrompt(_args: {
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
}): PromptBundle {
  return {
    system: "You are a strict 12-week execution coach.",
    user: "Based on current progress data, suggest today's top 2–3 priorities.",
    responseFormat: "json",
    exampleResponse: '[{"priority":"Complete one key task","reason":"Behind on target","tag":"Goal 1"}]',
  };
}

export function testPrompt(): PromptBundle {
  return {
    system: "",
    user: "Reply with two words: OK done",
    responseFormat: "text",
    exampleResponse: "OK done",
  };
}
