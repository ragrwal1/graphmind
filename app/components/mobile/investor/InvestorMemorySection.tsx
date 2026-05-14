"use client";

import type { MemberMemoryOverview } from "@/app/lib/memberNotes";

type Props = {
  overview: MemberMemoryOverview | null;
  status: "loading" | "ready" | "error";
};

/** Formats ISO timestamps or already-formatted date strings gracefully. */
const formatSignalDate = (raw: string) => {
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(d);
    }
  } catch {
    // fall through
  }
  return raw;
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));

export function InvestorMemorySection({ overview, status }: Props) {
  return (
    <section className="mobile-card-section">
      <h3 className="mobile-card-section-title">Memory</h3>

      {status === "loading" && (
        <p className="mobile-card-section-empty">Loading…</p>
      )}

      {status === "error" && (
        <p className="mobile-card-section-empty error">Could not load memory.</p>
      )}

      {status === "ready" && !overview && (
        <p className="mobile-card-section-empty">
          No notes yet — record a session to build this.
        </p>
      )}

      {status === "ready" && overview && (
        <div className="mobile-memory-content">
          {overview.overview_json.sentiment_label &&
            overview.overview_json.sentiment_label !== "unknown" && (
              <span
                className={`mobile-sentiment-pill ${overview.overview_json.sentiment_label}`}
              >
                {overview.overview_json.sentiment_label}
              </span>
            )}

          {overview.overview_json.primary_interests.length > 0 && (
            <div className="mobile-memory-block">
              <h4>Primary interests</h4>
              <div className="mobile-interest-tags">
                {overview.overview_json.primary_interests.map((interest) => (
                  <span key={interest}>{interest}</span>
                ))}
              </div>
            </div>
          )}

          {overview.overview_json.evaluation_lens.length > 0 && (
            <div className="mobile-memory-block">
              <h4>Evaluation lens</h4>
              <ul>
                {overview.overview_json.evaluation_lens.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            </div>
          )}

          {overview.overview_json.cautions.length > 0 && (
            <div className="mobile-memory-block">
              <h4>Cautions</h4>
              <ul>
                {overview.overview_json.cautions.map((caution) => (
                  <li key={caution}>{caution}</li>
                ))}
              </ul>
            </div>
          )}

          {overview.overview_json.recent_signals.length > 0 && (
            <div className="mobile-memory-block">
              <h4>Recent signals</h4>
              <ul>
                {overview.overview_json.recent_signals.map((signal) => (
                  <li key={`${signal.date}-${signal.text}`}>
                    <strong>{formatSignalDate(signal.date)}</strong> {signal.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mobile-memory-meta">
            <span>
              {overview.note_count} note{overview.note_count !== 1 ? "s" : ""}
            </span>
            {overview.last_note_at && (
              <span>Last: {formatDate(overview.last_note_at)}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
