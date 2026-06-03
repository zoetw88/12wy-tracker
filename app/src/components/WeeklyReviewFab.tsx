import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listWeeklyReviews } from "../db";
import { weekNumber, todayISO, hasProgramRange, PROGRAM_RANGE_EVENT } from "../dateUtils";
import { PROFILE_EVENT } from "../profile";
import { tr, useLang } from "../i18n";

export default function WeeklyReviewFab() {
  const [reviewedWeeks, setReviewedWeeks] = useState<Set<number>>(new Set());
  const [lang] = useLang();
  const navigate = useNavigate();

  const refresh = async () => {
    try {
      const all = await listWeeklyReviews();
      setReviewedWeeks(new Set(all.map((r) => r.week_number)));
    } catch {
      setReviewedWeeks(new Set());
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const handler = () => { refresh(); };
    window.addEventListener(PROGRAM_RANGE_EVENT, handler);
    window.addEventListener(PROFILE_EVENT, handler);
    window.addEventListener("weekly-review-changed", handler);
    return () => {
      window.removeEventListener(PROGRAM_RANGE_EVENT, handler);
      window.removeEventListener(PROFILE_EVENT, handler);
      window.removeEventListener("weekly-review-changed", handler);
    };
  }, []);

  // When no program range is configured, no weeks can have ended yet — hide the fab.
  if (!hasProgramRange()) return null;

  const currentWeek = weekNumber(todayISO());

  const unreviewedEndedCount =
    Math.max(0, currentWeek - 1) -
    [...Array(Math.max(0, currentWeek - 1)).keys()]
      .map((i) => i + 1)
      .filter((wn) => reviewedWeeks.has(wn)).length;

  const firstUnreviewedEndedWeek = (() => {
    for (let wn = 1; wn <= Math.max(0, currentWeek - 1); wn++) {
      if (!reviewedWeeks.has(wn)) return wn;
    }
    return null;
  })();

  if (unreviewedEndedCount === 0 || firstUnreviewedEndedWeek === null) return null;

  const handleOpen = () => {
    navigate("/stats?review=" + firstUnreviewedEndedWeek);
  };

  return (
    <div
      className="review-fab"
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleOpen();
      }}
    >
      <div className="review-fab-title">{tr(lang, "weeklyReview")}</div>
      <div className="review-fab-week">W{firstUnreviewedEndedWeek}</div>
      <div className="review-fab-hint">{tr(lang, "reviewFabHint", { count: unreviewedEndedCount })}</div>
      <div className="review-fab-cta">{tr(lang, "startWeeklyReview")} ›</div>
    </div>
  );
}
