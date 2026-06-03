import { describe, it, expect } from "vitest";
import { labels } from "./i18n";

describe("i18n label parity", () => {
  const zhKeys = Object.keys(labels.zh).sort();
  const enKeys = Object.keys(labels.en).sort();
  const frKeys = Object.keys(labels.fr).sort();

  it("labels.en has the same keys as labels.zh", () => {
    expect(enKeys).toEqual(zhKeys);
  });

  it("labels.fr has the same keys as labels.zh", () => {
    expect(frKeys).toEqual(zhKeys);
  });

  it("no key present in en that is absent from zh", () => {
    const extra = enKeys.filter((k) => !Object.prototype.hasOwnProperty.call(labels.zh, k));
    expect(extra).toEqual([]);
  });

  it("no key present in fr that is absent from zh", () => {
    const extra = frKeys.filter((k) => !Object.prototype.hasOwnProperty.call(labels.zh, k));
    expect(extra).toEqual([]);
  });

  it("keeps all language dictionaries aligned after removing unused settings labels", () => {
    expect(new Set(enKeys).size).toBe(enKeys.length);
    expect(new Set(frKeys).size).toBe(frKeys.length);
  });
});
