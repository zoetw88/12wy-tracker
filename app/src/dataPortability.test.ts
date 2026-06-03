import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectSafeLocalSettings,
  DATA_SNAPSHOT_SCHEMA,
  DATA_SNAPSHOT_VERSION,
  isLocalDataSnapshot,
  parseSnapshotJson,
  sanitizeSettingsForExport,
} from "./dataPortability";

describe("data portability", () => {
  beforeEach(() => vi.stubGlobal("localStorage", createMemoryStorage()));

  it("validates the snapshot schema and version", () => {
    expect(isLocalDataSnapshot({})).toBe(false);
    expect(isLocalDataSnapshot(validSnapshot())).toBe(true);
  });

  it("rejects invalid snapshot json", () => {
    expect(() => parseSnapshotJson('{"schema":"wrong"}')).toThrow("Invalid");
  });

  it("removes provider secrets from exported settings", () => {
    const safe = sanitizeSettingsForExport({
      llm_key_openai: "secret",
      api_key: "secret",
      access_token: "secret",
      llm_active_provider: "ollama",
      theme_mode: "dark",
    });
    expect(safe).toEqual({
      llm_active_provider: "ollama",
      theme_mode: "dark",
    });
  });

  it("collects only safe local settings for the active profile", () => {
    localStorage.setItem("p1:program_start", "2026-01-01");
    localStorage.setItem("p1:program_end", "2026-03-25");
    localStorage.setItem("llm_active_provider", "ollama");
    localStorage.setItem("llm_key_openai", "secret");
    localStorage.setItem("random", "nope");

    expect(collectSafeLocalSettings("p1")).toEqual({
      "p1:program_start": "2026-01-01",
      "p1:program_end": "2026-03-25",
      llm_active_provider: "ollama",
    });
  });
});

function validSnapshot() {
  return {
    schema: DATA_SNAPSHOT_SCHEMA,
    version: DATA_SNAPSHOT_VERSION,
    exported_at: "2026-06-02T00:00:00.000Z",
    source_profile: { id: "default", name: "Main" },
    local_settings: {},
    db_settings: {},
    tables: {
      goals: [],
      check_items: [],
      daily_entries: [],
      daily_meta: [],
      weekly_reviews: [],
      llm_usage: [],
    },
  };
}

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
