// Provider registry + pricing. All prices are USD per 1M tokens.
// Pricing approximations as of late 2025 — update in Settings if they drift.

export type ProviderId =
  | "gemini" | "groq" | "openai" | "anthropic" | "deepseek" | "kimi" | "ollama";

export type ApiCompat = "gemini" | "openai" | "anthropic";

export interface ModelInfo {
  id: string;
  name: string;
  inputPer1M: number;
  outputPer1M: number;
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  baseUrl: string;
  apiCompat: ApiCompat;
  needsKey: boolean;
  apiKeyStorage: string;
  defaultModel: string;
  models: ModelInfo[];
  docsUrl: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiCompat: "gemini",
    needsKey: true,
    apiKeyStorage: "llm_key_gemini",
    defaultModel: "gemini-2.5-flash",
    docsUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", inputPer1M: 0.30, outputPer1M: 2.50 },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", inputPer1M: 1.25, outputPer1M: 10.00 },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", inputPer1M: 0.10, outputPer1M: 0.40 },
    ],
  },
  {
    id: "groq",
    name: "Groq (Llama)",
    baseUrl: "https://api.groq.com/openai/v1",
    apiCompat: "openai",
    needsKey: true,
    apiKeyStorage: "llm_key_groq",
    defaultModel: "llama-3.3-70b-versatile",
    docsUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", inputPer1M: 0.59, outputPer1M: 0.79 },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", inputPer1M: 0.05, outputPer1M: 0.08 },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiCompat: "openai",
    needsKey: true,
    apiKeyStorage: "llm_key_openai",
    defaultModel: "gpt-4o-mini",
    docsUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o", name: "GPT-4o", inputPer1M: 2.50, outputPer1M: 10.00 },
      { id: "gpt-4o-mini", name: "GPT-4o mini", inputPer1M: 0.15, outputPer1M: 0.60 },
      { id: "gpt-4.1", name: "GPT-4.1", inputPer1M: 2.00, outputPer1M: 8.00 },
      { id: "gpt-4.1-mini", name: "GPT-4.1 mini", inputPer1M: 0.40, outputPer1M: 1.60 },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1",
    apiCompat: "anthropic",
    needsKey: true,
    apiKeyStorage: "llm_key_anthropic",
    defaultModel: "claude-haiku-4-5-20251001",
    docsUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-opus-4-7", name: "Claude Opus 4.7", inputPer1M: 15.00, outputPer1M: 75.00 },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", inputPer1M: 3.00, outputPer1M: 15.00 },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", inputPer1M: 1.00, outputPer1M: 5.00 },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiCompat: "openai",
    needsKey: true,
    apiKeyStorage: "llm_key_deepseek",
    defaultModel: "deepseek-chat",
    docsUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3 (chat)", inputPer1M: 0.27, outputPer1M: 1.10 },
      { id: "deepseek-reasoner", name: "DeepSeek R1 (reasoner)", inputPer1M: 0.55, outputPer1M: 2.19 },
    ],
  },
  {
    id: "kimi",
    name: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    apiCompat: "openai",
    needsKey: true,
    apiKeyStorage: "llm_key_kimi",
    defaultModel: "moonshot-v1-8k",
    docsUrl: "https://platform.moonshot.cn/console/api-keys",
    models: [
      { id: "moonshot-v1-8k", name: "Moonshot v1 8k", inputPer1M: 1.68, outputPer1M: 1.68 },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32k", inputPer1M: 3.36, outputPer1M: 3.36 },
      { id: "kimi-k2-0905-preview", name: "Kimi K2 (preview)", inputPer1M: 2.00, outputPer1M: 8.00 },
    ],
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    apiCompat: "openai",
    needsKey: false,
    apiKeyStorage: "llm_key_ollama",
    defaultModel: "llama3.2",
    docsUrl: "https://ollama.com/library",
    models: [
      { id: "llama3.2", name: "Llama 3.2", inputPer1M: 0, outputPer1M: 0 },
      { id: "qwen2.5", name: "Qwen 2.5", inputPer1M: 0, outputPer1M: 0 },
      { id: "deepseek-r1", name: "DeepSeek R1 (local)", inputPer1M: 0, outputPer1M: 0 },
    ],
  },
];

export function findProvider(id: ProviderId): ProviderConfig {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function findModel(providerId: ProviderId, modelId: string): ModelInfo | null {
  const p = PROVIDERS.find((x) => x.id === providerId);
  return p?.models.find((m) => m.id === modelId) ?? null;
}

export function computeCost(
  providerId: ProviderId,
  modelId: string,
  inTokens: number,
  outTokens: number
): number {
  const m = findModel(providerId, modelId);
  if (!m) return 0;
  return (inTokens / 1_000_000) * m.inputPer1M + (outTokens / 1_000_000) * m.outputPer1M;
}

export type PromptKey =
  | "create_goal_design"
  | "goal_field_questions"
  | "goal_field_items"
  | "suggest_items"
  | "suggest_priority"
  | "setup_goal_coach"
  | "daily_review"
  | "weekly_review"
  | "dashboard_advice"
  | "test";
