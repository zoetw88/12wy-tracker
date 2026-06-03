import { describe, it, expect, beforeEach, vi } from "vitest";
import { weekNumber, daysUntilWeekEnds, hasProgramRange } from "./dateUtils";

// ---------------------------------------------------------------------------
// localStorage stub — node environment has no localStorage
// ---------------------------------------------------------------------------
function makeLocalStorageStub(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k in store) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

// The active profile id defaults to "default" (see profile.ts DEFAULT_PROFILE).
// programStart/End use profileKey(key) which resolves to "default:program_start"
// and "default:program_end" when active_profile is unset (defaults to "default").
const PROGRAM_START = "2026-05-26";
const PROGRAM_END   = "2026-08-17";

function seedStorage() {
  vi.stubGlobal(
    "localStorage",
    makeLocalStorageStub({
      // no active_profile key → activeProfileId() falls back to "default"
      "default:program_start": PROGRAM_START,
      "default:program_end":   PROGRAM_END,
      // profiles list so listProfiles() returns the default profile
      profiles: JSON.stringify([{ id: "default", name: "主線" }]),
    })
  );
}

beforeEach(() => {
  seedStorage();
});

// ---------------------------------------------------------------------------
// weekNumber
// ---------------------------------------------------------------------------
describe("weekNumber", () => {
  it("date before program start → week 1 (clamped)", () => {
    // 1 day before start
    expect(weekNumber("2026-05-25")).toBe(1);
  });

  it("date on program start → week 1", () => {
    expect(weekNumber("2026-05-26")).toBe(1);
  });

  it("date 84+ days after start → week 12 (clamped at TOTAL_WEEKS)", () => {
    // 2026-05-26 + 84 days = 2026-08-18  (day 85, week floor(84/7)+1 = 13 → clamped to 12)
    expect(weekNumber("2026-08-18")).toBe(12);
  });

  it("date at start of week 2 (day 7) → week 2", () => {
    // 2026-05-26 + 7 = 2026-06-02
    expect(weekNumber("2026-06-02")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// daysUntilWeekEnds
// ---------------------------------------------------------------------------
describe("daysUntilWeekEnds", () => {
  it("mid-week: today is in the middle of week 1, end of week 1 is 2026-06-01 (day 6)", () => {
    // week 1: 2026-05-26 → 2026-06-01
    // today = 2026-05-28 → days until 2026-06-01 = 4
    expect(daysUntilWeekEnds(1, "2026-05-28")).toBe(4);
  });

  it("past week → 0 (clamped)", () => {
    // today is after week 1 ended
    expect(daysUntilWeekEnds(1, "2026-06-10")).toBe(0);
  });

  it("today is the last day of week 1 → 0", () => {
    // week 1 ends 2026-06-01; today = 2026-06-01 → 0 days remaining
    expect(daysUntilWeekEnds(1, "2026-06-01")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// hasProgramRange
// ---------------------------------------------------------------------------
describe("hasProgramRange", () => {
  it("returns true when both keys are set", () => {
    expect(hasProgramRange()).toBe(true);
  });

  it("returns false when start key is missing", () => {
    vi.stubGlobal(
      "localStorage",
      makeLocalStorageStub({
        "default:program_end": PROGRAM_END,
        profiles: JSON.stringify([{ id: "default", name: "主線" }]),
      })
    );
    expect(hasProgramRange()).toBe(false);
  });

  it("returns false when end key is missing", () => {
    vi.stubGlobal(
      "localStorage",
      makeLocalStorageStub({
        "default:program_start": PROGRAM_START,
        profiles: JSON.stringify([{ id: "default", name: "主線" }]),
      })
    );
    expect(hasProgramRange()).toBe(false);
  });
});
