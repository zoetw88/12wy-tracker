import { PromptKey } from "./providers";

export interface PromptVersionInfo {
  key: PromptKey;
  activeVersion: string;
  versions: string[];
  rollbackTo: string | null;
  evalCases: string;
  notes: string;
}

const PROMPT_VERSION_PREFIX = "llm_prompt_version_";

export const PROMPT_REGISTRY: Record<PromptKey, PromptVersionInfo> = {
  create_goal_design: {
    key: "create_goal_design",
    activeVersion: "v1",
    versions: ["v1"],
    rollbackTo: null,
    evalCases: "goal_design_cases",
    notes: "Designs a measurable 12-week target from the user's goal and reason.",
  },
  goal_field_questions: {
    key: "goal_field_questions",
    activeVersion: "v1",
    versions: ["v1"],
    rollbackTo: null,
    evalCases: "goal_design_cases",
    notes: "Checks whether more user context is needed before daily fields are generated.",
  },
  goal_field_items: {
    key: "goal_field_items",
    activeVersion: "v1",
    versions: ["v1"],
    rollbackTo: null,
    evalCases: "goal_design_cases",
    notes: "Generates daily tracking fields after follow-up answers are available.",
  },
  setup_goal_coach: {
    key: "setup_goal_coach",
    activeVersion: "v1",
    versions: ["v1"],
    rollbackTo: null,
    evalCases: "goal_design_cases",
    notes: "Creates a goal-specific coach persona and background fields.",
  },
  suggest_items: {
    key: "suggest_items",
    activeVersion: "v1",
    versions: ["v1"],
    rollbackTo: null,
    evalCases: "goal_design_cases",
    notes: "Suggests concrete daily check-items for a goal.",
  },
  suggest_priority: {
    key: "suggest_priority",
    activeVersion: "v1",
    versions: ["v1"],
    rollbackTo: null,
    evalCases: "priority_cases",
    notes: "Chooses today's top priorities from current 12-week progress data.",
  },
  daily_review: {
    key: "daily_review",
    activeVersion: "v1",
    versions: ["v1"],
    rollbackTo: null,
    evalCases: "priority_cases",
    notes: "Turns today's log into concise execution feedback.",
  },
  weekly_review: {
    key: "weekly_review",
    activeVersion: "v1",
    versions: ["v1"],
    rollbackTo: null,
    evalCases: "weekly_review_cases",
    notes: "Reviews weekly execution and identifies next-week focus.",
  },
  dashboard_advice: {
    key: "dashboard_advice",
    activeVersion: "v1",
    versions: ["v1"],
    rollbackTo: null,
    evalCases: "weekly_review_cases",
    notes: "Summarizes dashboard data into strategic advice.",
  },
  test: {
    key: "test",
    activeVersion: "v1",
    versions: ["v1"],
    rollbackTo: null,
    evalCases: "connection_test",
    notes: "Small provider connectivity check.",
  },
};

export function listPromptVersions(): PromptVersionInfo[] {
  return Object.values(PROMPT_REGISTRY).map((info) => ({
    ...info,
    activeVersion: getPromptVersion(info.key),
  }));
}

export function getPromptVersion(key: PromptKey): string {
  const info = PROMPT_REGISTRY[key];
  const stored = localStorage.getItem(storageKey(key));
  return stored && info.versions.includes(stored) ? stored : info.activeVersion;
}

export function setPromptVersion(key: PromptKey, version: string): void {
  const info = PROMPT_REGISTRY[key];
  if (!info.versions.includes(version)) {
    throw new Error(`Unknown prompt version for ${key}: ${version}`);
  }
  localStorage.setItem(storageKey(key), version);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("llm-prompt-version-change"));
  }
}

export function resolvePromptVersion(key: PromptKey, override?: string): string {
  return override?.trim() || getPromptVersion(key);
}

function storageKey(key: PromptKey): string {
  return `${PROMPT_VERSION_PREFIX}${key}`;
}
