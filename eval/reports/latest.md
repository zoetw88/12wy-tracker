# Eval Report

Generated: 2026-06-03T05:11:51.759Z

Source: sample-format

Format artifact only. Replace with real promptfoo metrics after running eval with provider keys.

## Rubric

- specificity
- 12_week_year_fit
- actionability
- uses_user_context
- avoids_generic_encouragement

## Cases

| Prompt | Version | Fixture | Model | Latency | Tokens | Cost | Parse | Rubric Avg | Human | Decision |
|---|---|---|---|---:|---:|---:|---|---:|---|---|
| create_goal_design | v1 | goal_design_cases | sample:gpt-4o-mini | 1820 | 980+420 | $0.000400 | yes | 0.84 | unrated | keep |
| suggest_priority | v1 | priority_cases | sample:gpt-4o-mini | 1240 | 740+260 | $0.000200 | yes | 0.83 | unrated | keep |
| weekly_review | v1 | weekly_review_cases | sample:gpt-4o-mini | 2100 | 1220+520 | $0.000500 | yes | 0.83 | unrated | revise-after-real-run |

## Next Decision

Run `npm run eval` with real provider keys, replace sample metrics, then compare prompt/model changes against this same report shape.
