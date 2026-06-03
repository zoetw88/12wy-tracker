import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPromptVersion,
  listPromptVersions,
  resolvePromptVersion,
  setPromptVersion,
} from "./promptRegistry";

describe("prompt registry", () => {
  beforeEach(() => vi.stubGlobal("localStorage", createMemoryStorage()));

  it("returns registry default version", () => {
    expect(getPromptVersion("weekly_review")).toBe("v1");
  });

  it("honors explicit override for usage logging", () => {
    expect(resolvePromptVersion("weekly_review", "v2-experiment")).toBe("v2-experiment");
  });

  it("persists known active versions", () => {
    setPromptVersion("suggest_priority", "v1");
    expect(getPromptVersion("suggest_priority")).toBe("v1");
  });

  it("rejects unknown versions", () => {
    expect(() => setPromptVersion("suggest_priority", "v999")).toThrow("Unknown prompt version");
  });

  it("lists prompt metadata for Settings visibility", () => {
    const prompts = listPromptVersions();
    expect(prompts.some((p) => p.key === "weekly_review" && p.evalCases === "weekly_review_cases")).toBe(true);
    expect(prompts.every((p) => p.activeVersion)).toBe(true);
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: (key: string, value: string) => { store.set(key, value); },
  };
}
