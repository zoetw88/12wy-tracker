import { describe, it, expect } from "vitest";
import { scoreDay, weeklyReviewExecutionScore } from "./score";
import type { Goal, CheckItem, DailyEntry } from "./types";

// Minimal fixture builders
function makeGoal(id: number, weight: number): Goal {
  return {
    id,
    name: `Goal ${id}`,
    description: "",
    why: "",
    target_text: "",
    weight,
    active: 1,
    sort_order: id,
    persona: null,
    context_json: null,
  };
}

function makeItem(id: number, goalId: number): CheckItem {
  return {
    id,
    goal_id: goalId,
    label: `Item ${id}`,
    type: "bool",
    target_value: null,
    unit: null,
    options: null,
    sort_order: id,
    active: 1,
  };
}

function makeBoolEntry(itemId: number, date: string, done: boolean): DailyEntry {
  return {
    date,
    check_item_id: itemId,
    value_bool: done ? 1 : 0,
    value_num: null,
    value_text: null,
  };
}

describe("scoreDay", () => {
  it("2-goal weighted case: G1 weight=3 done, G2 weight=1 not done → weightedPct=75, flatPct=50", () => {
    const goals = [makeGoal(1, 3), makeGoal(2, 1)];
    const items = [makeItem(10, 1), makeItem(20, 2)];
    const entries = [makeBoolEntry(10, "2026-01-01", true)];

    const result = scoreDay(goals, items, entries);

    expect(result.weightedPct).toBe(75);
    expect(result.flatPct).toBe(50);
    expect(result.perGoal).toHaveLength(2);
    expect(result.perGoal[0].ratio).toBe(1);
    expect(result.perGoal[1].ratio).toBe(0);
  });
});

describe("weeklyReviewExecutionScore", () => {
  it("3 logged days (100/75/25) + 1 empty day → 67", () => {
    // G1 weight=3 (item id=1), G2 weight=1 (item id=2)
    const goals = [makeGoal(1, 3), makeGoal(2, 1)];
    const items = [makeItem(1, 1), makeItem(2, 2)];

    // Day1: both done → G1 ratio=1, G2 ratio=1 → weightedPct = round((3+1)/4*100) = 100
    // Day2: item1 done, item2 not → G1 ratio=1, G2 ratio=0 → weightedPct = round(3/4*100) = 75
    // Day3: item1 not, item2 done → G1 ratio=0, G2 ratio=1 → weightedPct = round(1/4*100) = 25
    // Day4: no entries → not counted in byDate
    const entries: DailyEntry[] = [
      makeBoolEntry(1, "2026-01-01", true),
      makeBoolEntry(2, "2026-01-01", true),
      makeBoolEntry(1, "2026-01-02", true),
      makeBoolEntry(2, "2026-01-02", false),
      makeBoolEntry(1, "2026-01-03", false),
      makeBoolEntry(2, "2026-01-03", true),
    ];

    const result = weeklyReviewExecutionScore(goals, items, entries);
    // (100 + 75 + 25) / 3 = 66.67 → round → 67
    expect(result).toBe(67);
  });

  it("all-empty week (no entries) → 0", () => {
    const goals = [makeGoal(1, 3), makeGoal(2, 1)];
    const items = [makeItem(1, 1), makeItem(2, 2)];

    const result = weeklyReviewExecutionScore(goals, items, []);
    expect(result).toBe(0);
  });
});
