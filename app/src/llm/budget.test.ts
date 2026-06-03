import { describe, expect, it } from "vitest";
import {
  evaluateLlmBudget,
  formatBudgetLimit,
  parseBudgetLimit,
} from "./budget";

describe("LLM budget", () => {
  it("parses empty and invalid limits as unset", () => {
    expect(parseBudgetLimit("")).toBeNull();
    expect(parseBudgetLimit("   ")).toBeNull();
    expect(parseBudgetLimit("-1")).toBeNull();
    expect(parseBudgetLimit("not-a-number")).toBeNull();
  });

  it("accepts zero as an intentional hard stop", () => {
    expect(parseBudgetLimit("0")).toBe(0);
    expect(formatBudgetLimit(0)).toBe("0");
  });

  it("blocks when daily budget is already reached", () => {
    const status = evaluateLlmBudget(
      { today_cost: 0.5, month_cost: 0.5 },
      { dailyUsd: 0.5, monthlyUsd: null }
    );
    expect(status.blocked).toBe(true);
    expect(status.reason).toContain("Daily");
    expect(status.dailyRemaining).toBe(0);
  });

  it("blocks when monthly budget is already reached", () => {
    const status = evaluateLlmBudget(
      { today_cost: 0.1, month_cost: 2 },
      { dailyUsd: 1, monthlyUsd: 2 }
    );
    expect(status.blocked).toBe(true);
    expect(status.reason).toContain("Monthly");
    expect(status.monthlyRemaining).toBe(0);
  });

  it("keeps unconfigured budgets open", () => {
    const status = evaluateLlmBudget(
      { today_cost: 100, month_cost: 200 },
      { dailyUsd: null, monthlyUsd: null }
    );
    expect(status.blocked).toBe(false);
    expect(status.dailyRemaining).toBeNull();
    expect(status.monthlyRemaining).toBeNull();
  });
});
