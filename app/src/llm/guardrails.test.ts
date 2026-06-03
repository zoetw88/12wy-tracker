import { describe, expect, it } from "vitest";
import {
  MAX_LLM_ERROR_CHARS,
  MAX_LLM_INPUT_CHARS,
  MAX_LLM_OUTPUT_CHARS,
  normalizeLlmRequest,
  sanitizeLlmError,
  sanitizeLlmInput,
  sanitizeLlmOutput,
} from "./guardrails";

describe("local LLM guardrails", () => {
  it("removes invisible control and bidi override characters while preserving newlines", () => {
    const input = "hello\u0000\r\nworld\u202E";
    expect(sanitizeLlmInput(input)).toBe("hello\nworld");
  });

  it("clamps oversized prompts", () => {
    const result = sanitizeLlmInput("a".repeat(MAX_LLM_INPUT_CHARS + 1));
    expect(result.length).toBeGreaterThan(MAX_LLM_INPUT_CHARS);
    expect(result).toContain("[truncated by local LLM guardrail]");
  });

  it("clamps oversized responses", () => {
    const result = sanitizeLlmOutput("b".repeat(MAX_LLM_OUTPUT_CHARS + 1));
    expect(result.length).toBeGreaterThan(MAX_LLM_OUTPUT_CHARS);
    expect(result).toContain("[truncated by local LLM guardrail]");
  });

  it("keeps provider error detail bounded for local logs", () => {
    const result = sanitizeLlmError("x".repeat(MAX_LLM_ERROR_CHARS + 20));
    expect(result.length).toBeGreaterThan(MAX_LLM_ERROR_CHARS);
    expect(result).toContain("[truncated by local LLM guardrail]");
  });

  it("normalizes request system and user text before provider calls", () => {
    const req = normalizeLlmRequest({
      promptKey: "test",
      system: "sys\u0000",
      user: "user\u202E",
    });
    expect(req.system).toBe("sys");
    expect(req.user).toBe("user");
  });
});
