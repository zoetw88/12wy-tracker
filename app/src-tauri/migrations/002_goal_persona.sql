-- v2: per-goal coach persona + dynamic background context
-- persona      free-text system prompt prepended when this goal is the
--              focus of an LLM call (priority pick, daily/weekly review)
-- context_json JSON object captured from the user during 'AI 設定教練'
--              flow; the keys/labels/types are LLM-chosen per goal,
--              so we keep it as opaque JSON rather than columns

ALTER TABLE goals ADD COLUMN persona TEXT;
ALTER TABLE goals ADD COLUMN context_json TEXT;
