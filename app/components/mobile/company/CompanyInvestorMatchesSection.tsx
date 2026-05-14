"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, UserRound } from "lucide-react";
import type { CompanySeed } from "@/app/lib/companies";
import type {
  CompanyInvestorMatch,
  CompanyInvestorMatchResponse,
} from "@/app/lib/companyInvestorMatches";

type Props = {
  company: CompanySeed;
};

type MatchState =
  | { status: "loading" }
  | { status: "done"; matches: CompanyInvestorMatch[] }
  | { status: "error"; message: string };

function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

function signalsFor(match: CompanyInvestorMatch) {
  return [
    ...match.primary_interests.slice(0, 2),
    ...match.evaluation_lens.slice(0, 1),
  ].slice(0, 3);
}

export function CompanyInvestorMatchesSection({ company }: Props) {
  const [state, setState] = useState<MatchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadMatches() {
      setState({ status: "loading" });

      try {
        const response = await fetch(
          `/api/company-matches?company=${encodeURIComponent(company.airtable_id)}&limit=5`
        );
        const data = (await response.json()) as CompanyInvestorMatchResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load matches");
        }

        if (!cancelled) {
          setState({ status: "done", matches: data.matches });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Failed to load matches",
          });
        }
      }
    }

    void loadMatches();

    return () => {
      cancelled = true;
    };
  }, [company.airtable_id]);

  return (
    <section className="mobile-card-section">
      <h3 className="mobile-card-section-title">Top Investors</h3>

      {state.status === "loading" && (
        <div className="mobile-company-match-loading">
          <RefreshCw size={14} className="wb-spin" />
          Calculating top investor matches...
        </div>
      )}

      {state.status === "error" && (
        <p className="mobile-card-section-empty error">{state.message}</p>
      )}

      {state.status === "done" && state.matches.length === 0 && (
        <p className="mobile-card-section-empty">No investor memory matches yet.</p>
      )}

      {state.status === "done" && state.matches.length > 0 && (
        <div className="mobile-company-match-list">
          {state.matches.map((match, index) => {
            const signals = signalsFor(match);
            return (
              <article className="mobile-company-match-card" key={match.airtable_id}>
                <div className="mobile-company-match-rank">{index + 1}</div>
                <div className="mobile-company-match-body">
                  <div className="mobile-company-match-head">
                    <div>
                      <h4>
                        <UserRound size={14} strokeWidth={1.75} />
                        {match.name}
                      </h4>
                      {match.related_organization && <p>{match.related_organization}</p>}
                    </div>
                    <span className="mobile-company-match-score">
                      {formatScore(match.similarity)}
                    </span>
                  </div>

                  {signals.length > 0 && (
                    <div className="mobile-company-match-signals">
                      {signals.map((signal) => (
                        <span key={signal}>{signal}</span>
                      ))}
                    </div>
                  )}

                  {match.overview_text && (
                    <p className="mobile-company-match-overview">{match.overview_text}</p>
                  )}

                  <div className="mobile-company-match-meta">
                    <span>{match.note_count} notes</span>
                    {match.linkedin && (
                      <a href={match.linkedin} target="_blank" rel="noopener noreferrer">
                        LinkedIn <ExternalLink size={11} strokeWidth={1.75} />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
