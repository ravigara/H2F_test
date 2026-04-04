import { REVIEW_FIELD_GROUPS } from "../adapters/structured-review";
import { Domain, StructuredReviewDraft } from "../types";
import { domainLabel, formatClock } from "../lib/format";

interface StructuredReviewPanelProps {
  domain: Domain;
  draft: StructuredReviewDraft | null;
  onRegenerate: () => void;
  onFieldChange: (
    section: "generic" | "domainSpecific",
    key: string,
    value: string,
  ) => void;
}

export function StructuredReviewPanel({
  domain,
  draft,
  onRegenerate,
  onFieldChange,
}: StructuredReviewPanelProps) {
  const domainFields =
    domain === "healthcare" ? REVIEW_FIELD_GROUPS.healthcare : REVIEW_FIELD_GROUPS.financial;

  return (
    <section className="panel review-shell">
      <div className="panel__head">
        <div>
          <p className="eyebrow">Editable Structured Review</p>
          <h2>{domainLabel(domain)} review draft</h2>
        </div>
        <button type="button" onClick={onRegenerate}>
          Regenerate draft
        </button>
      </div>

      {draft ? (
        <>
          <p className="surface__copy">{draft.note}</p>
          <div className="summary-list">
            {draft.sourceSummary.map((item) => (
              <div key={item} className="summary-list__item">
                {item}
              </div>
            ))}
          </div>

          <div className="review-grid">
            <article className="subpanel">
              <div className="subpanel__head">
                <h3>Generic fields</h3>
                <span>{formatClock(draft.generatedAt)}</span>
              </div>
              <div className="field-stack">
                {REVIEW_FIELD_GROUPS.generic.map((field) => (
                  <label key={field} className="field">
                    <span>{field}</span>
                    <textarea
                      rows={3}
                      value={draft.generic[field] || ""}
                      onChange={(event) =>
                        onFieldChange("generic", field, event.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
            </article>

            <article className="subpanel">
              <div className="subpanel__head">
                <h3>{domainLabel(domain)} fields</h3>
                <span>Typed adapter</span>
              </div>
              <div className="field-stack">
                {domainFields.map((field) => (
                  <label key={field} className="field">
                    <span>{field}</span>
                    <textarea
                      rows={3}
                      value={draft.domainSpecific[field] || ""}
                      onChange={(event) =>
                        onFieldChange("domainSpecific", field, event.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
            </article>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>
            No review draft exists yet. Generate one after a transcript or assistant response is
            available.
          </p>
        </div>
      )}
    </section>
  );
}
