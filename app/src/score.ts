import { CheckItem, DailyEntry, DailyMeta, Goal } from "./types";

export interface ItemScore {
  item: CheckItem;
  done: boolean;
  ratio: number; // 0..1
}

export interface GoalScore {
  goal: Goal;
  items: ItemScore[];
  doneCount: number;
  totalCount: number;
  ratio: number; // weighted ratio 0..1
}

export interface DayScore {
  perGoal: GoalScore[];
  weightedPct: number; // 0..100 weighted by goal.weight
  flatPct: number;     // 0..100 simple done/total
}

export function entryDone(item: CheckItem, e: DailyEntry | undefined): { done: boolean; ratio: number } {
  if (!e) return { done: false, ratio: 0 };
  switch (item.type) {
    case "bool":
      return { done: !!e.value_bool, ratio: e.value_bool ? 1 : 0 };
    case "number":
    case "minutes": {
      const v = e.value_num ?? 0;
      const target = item.target_value ?? 1;
      const ratio = target > 0 ? Math.min(1, v / target) : v > 0 ? 1 : 0;
      return { done: v > 0 && (target === null || v >= (item.target_value ?? 1)), ratio };
    }
    case "scale": {
      const v = e.value_num ?? 0;
      return { done: v > 0, ratio: v / 5 };
    }
    case "choice":
    case "text": {
      const has = !!(e.value_text && e.value_text.trim().length > 0);
      return { done: has, ratio: has ? 1 : 0 };
    }
  }
}

export function scoreDay(
  goals: Goal[],
  items: CheckItem[],
  entries: DailyEntry[]
): DayScore {
  const entryMap = new Map(entries.map((e) => [e.check_item_id, e]));
  const perGoal: GoalScore[] = [];

  let totalWeight = 0;
  let weightedAcc = 0;
  let totalDone = 0;
  let totalCount = 0;

  for (const g of goals.filter((x) => x.active)) {
    const gi = items.filter((i) => i.goal_id === g.id && i.active);
    const scores: ItemScore[] = gi.map((it) => {
      const r = entryDone(it, entryMap.get(it.id));
      return { item: it, ...r };
    });
    const doneCount = scores.filter((s) => s.done).length;
    const ratio = scores.length > 0
      ? scores.reduce((s, x) => s + x.ratio, 0) / scores.length
      : 0;
    perGoal.push({ goal: g, items: scores, doneCount, totalCount: scores.length, ratio });
    if (scores.length > 0) {
      totalWeight += g.weight;
      weightedAcc += g.weight * ratio;
    }
    totalDone += doneCount;
    totalCount += scores.length;
  }

  const weightedPct = totalWeight > 0 ? Math.round((weightedAcc / totalWeight) * 100) : 0;
  const flatPct = totalCount > 0 ? Math.round((totalDone / totalCount) * 100) : 0;
  return { perGoal, weightedPct, flatPct };
}

/**
 * Computes execution_score for a weekly review.
 *
 * Groups entries by date. For each date that has ANY entry, delegates to
 * scoreDay to get the weighted completion percentage. Returns the average of
 * those per-day weightedPct values, rounded to an integer. Dates with zero
 * entries are NOT counted (not in the denominator). Returns 0 when no date
 * has entries.
 */
export function weeklyReviewExecutionScore(
  goals: Goal[],
  items: CheckItem[],
  entries: DailyEntry[]
): number {
  // Group entries by date
  const byDate = new Map<string, DailyEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date);
    if (list) {
      list.push(e);
    } else {
      byDate.set(e.date, [e]);
    }
  }

  if (byDate.size === 0) return 0;

  let sum = 0;
  for (const dayEntries of byDate.values()) {
    sum += scoreDay(goals, items, dayEntries).weightedPct;
  }
  return Math.round(sum / byDate.size);
}

export function deloadTrigger(m: DailyMeta): string[] {
  const reasons: string[] = [];
  if (m.sleep_hours !== null && m.sleep_hours < 6) reasons.push("睡眠 < 6 小時");
  if (m.energy_night !== null && m.energy_night <= 1) reasons.push("晚能量極低");
  return reasons;
}
