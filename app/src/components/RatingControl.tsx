import { useEffect, useState } from "react";
import { tr, useLang } from "../i18n";
import { updateQualityScore } from "../llm/usage";

interface Props {
  requestId: string | null;
}

export default function RatingControl({ requestId }: Props) {
  const [lang] = useLang();
  const [rated, setRated] = useState<null | "up" | "down">(null);

  // Reset when requestId changes (new output = fresh ratable state)
  useEffect(() => {
    setRated(null);
  }, [requestId]);

  if (!requestId) return null;

  const rate = async (kind: "up" | "down") => {
    // One-shot guard: if already rated, do not call updateQualityScore again
    if (rated !== null) return;

    try {
      await updateQualityScore(requestId, kind === "up" ? 1.0 : 0.0);
      setRated(kind);
    } catch {
      // Keep rated null so user can retry (failed write left quality_score NULL)
    }
  };

  return (
    <div className="rating-control">
      <span className="rating-control-prompt">{tr(lang, "ratePrompt")}</span>
      <div className="rating-control-buttons">
        <button
          className={`rating-btn rating-btn-up${rated === "up" ? " rating-btn--chosen" : ""}${rated !== null ? " rating-btn--dim" : ""}`}
          onClick={() => rate("up")}
          disabled={rated !== null}
          title={tr(lang, "rateUp")}
          aria-label={tr(lang, "rateUp")}
        >
          👍
        </button>
        <button
          className={`rating-btn rating-btn-down${rated === "down" ? " rating-btn--chosen" : ""}${rated !== null ? " rating-btn--dim" : ""}`}
          onClick={() => rate("down")}
          disabled={rated !== null}
          title={tr(lang, "rateDown")}
          aria-label={tr(lang, "rateDown")}
        >
          👎
        </button>
      </div>
      {rated !== null && (
        <span className="rating-control-done">{tr(lang, "rated")}</span>
      )}
    </div>
  );
}
