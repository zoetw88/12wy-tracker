# Preference Eval Dataset Report

Generated: 2026-06-03T05:11:32.183Z

Source: eval/preferences/coach_preference_cases.json

Preference dataset artifact only. Pairwise judge runs require provider keys and human calibration before being used as a release gate.

## Summary

- Total cases: 3
- Regression cases: 2
- Prompt keys: weekly_review (1), suggest_priority (1), create_goal_design (1)
- Rubric: specificity, 12_week_year_fit, actionability, uses_user_context, avoids_generic_encouragement

## Release Gate Shape

| Metric | Target |
|---|---|
| style_preference_win_rate | >= 0.70 against baseline |
| failure_replay_pass_rate | >= 0.95 |
| critical_factual_error_count | 0 |
| format_violation_rate | <= 0.02 |
| human_judge_agreement | calibrated before blocking releases |

## Cases

| Case | Prompt | Version | Source | Regression | Rubric Avg | Preference Reason |
|---|---|---|---|---|---:|---|
| weekly_review_style_001 | weekly_review | v1 | curated_failure_replay | yes | 5.00 | preferred output names the actual lagging goal<br>preferred output uses the user's rain excuse note<br>preferred output gives concrete next-week actions<br>rejected output is generic encouragement |
| priority_actionability_001 | suggest_priority | v1 | curated_edge_case | yes | 4.60 | preferred output makes a tradeoff instead of listing everything<br>preferred output references 22 problems behind, low HRV, and sleep<br>preferred output explains why recovery is part of execution<br>rejected output overloads the day |
| goal_design_style_001 | create_goal_design | v1 | curated_style_pair | no | 4.80 | preferred output turns vague writing improvement into measurable delivery<br>preferred output defines weekly cadence<br>preferred output avoids abstract self-improvement language |

## Next Decision

Run a provider-backed pairwise judge against this dataset, then calibrate a sample with human review before using win-rate as a release gate.
