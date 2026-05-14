"use client";

import { useMemo, useState } from "react";
import { Building2, Check, ExternalLink, RefreshCw, Search, UserRound } from "lucide-react";
import type { CompanySeed } from "@/app/lib/companies";
import type {
  CompanyInvestorMatch,
  CompanyInvestorMatchResponse,
} from "@/app/lib/companyInvestorMatches";

type MatcherState =
  | { status: "idle" }
  | { status: "loading"; companyId: string }
  | { status: "done"; response: CompanyInvestorMatchResponse }
  | { status: "error"; message: string };

type Props = {
  companies: CompanySeed[];
};

function fmtScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

function companySubtitle(company: CompanySeed) {
  return [company.vertical, company.stage, company.diligence_status]
    .filter(Boolean)
    .join(" · ");
}

function signalList(match: CompanyInvestorMatch) {
  return [
    ...match.primary_interests.slice(0, 3),
    ...match.evaluation_lens.slice(0, 2),
  ].slice(0, 5);
}

function investorProfileHref(match: CompanyInvestorMatch) {
  return `/?member=${encodeURIComponent(match.airtable_id)}`;
}

export function CompanyInvestorMatcher({ companies }: Props) {
  const [filter, setFilter] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState(companies[0]?.airtable_id ?? "");
  const [limit, setLimit] = useState(20);
  const [state, setState] = useState<MatcherState>({ status: "idle" });

  const filteredCompanies = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter((company) =>
      [
        company.name,
        company.vertical,
        company.stage,
        company.diligence_status,
        company.description,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [companies, filter]);

  const selectedCompany =
    companies.find((company) => company.airtable_id === selectedCompanyId) ?? companies[0] ?? null;

  async function runMatch(companyId = selectedCompanyId) {
    if (!companyId) return;

    setSelectedCompanyId(companyId);
    setState({ status: "loading", companyId });

    try {
      const response = await fetch(
        `/api/company-matches?company=${encodeURIComponent(companyId)}&limit=${limit}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setState({ status: "done", response: data as CompanyInvestorMatchResponse });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to match investors",
      });
    }
  }

  const response = state.status === "done" ? state.response : null;

  return (
    <div className="cm-layout">
      <aside className="cm-sidebar">
        <div className="cm-panel">
          <h3 className="cm-panel-title">
            <Building2 size={14} /> Company
          </h3>
          <div className="cm-search-wrap">
            <Search size={15} className="cm-search-icon" />
            <input
              className="cm-search-input"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter Airtable companies"
            />
          </div>
          <select
            className="cm-select"
            value={selectedCompanyId}
            onChange={(event) => setSelectedCompanyId(event.target.value)}
            size={12}
          >
            {filteredCompanies.map((company) => (
              <option key={company.airtable_id} value={company.airtable_id}>
                {company.name}
              </option>
            ))}
          </select>
          <div className="cm-count">{filteredCompanies.length} companies</div>
        </div>

        {selectedCompany && (
          <div className="cm-panel">
            <h3 className="cm-panel-title">Selected</h3>
            <div className="cm-selected-name">{selectedCompany.name}</div>
            <div className="cm-selected-meta">{companySubtitle(selectedCompany) || "No metadata"}</div>
            {selectedCompany.description && (
              <p className="cm-selected-desc">{selectedCompany.description}</p>
            )}
          </div>
        )}

        <div className="cm-panel">
          <h3 className="cm-panel-title">Controls</h3>
          <label className="cm-label" htmlFor="match-limit">
            Returned matches
          </label>
          <input
            id="match-limit"
            className="cm-range"
            type="range"
            min={5}
            max={50}
            step={5}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
          <div className="cm-limit-value">{limit}</div>
          <button
            className="cm-run-btn"
            type="button"
            disabled={!selectedCompanyId || state.status === "loading"}
            onClick={() => void runMatch()}
          >
            {state.status === "loading" ? (
              <>
                <RefreshCw size={14} className="wb-spin" /> Matching
              </>
            ) : (
              <>
                <Check size={14} /> Match Investors
              </>
            )}
          </button>
        </div>
      </aside>

      <section className="cm-results">
        <div className="cm-results-head">
          <div>
            <p className="eyebrow">Investor fit</p>
            <h2>{response ? response.company.name : "Select a company"}</h2>
          </div>
          {response && (
            <div className="cm-debug">
              <span>{response.debug.matches_returned} matches</span>
              <span>{response.debug.investors_considered} considered</span>
            </div>
          )}
        </div>

        {state.status === "idle" && (
          <div className="cm-empty">
            Pick a company from the Airtable list, then run the match.
          </div>
        )}

        {state.status === "loading" && (
          <div className="cm-empty">
            Matching company embedding against investor memories...
          </div>
        )}

        {state.status === "error" && <div className="cm-error">{state.message}</div>}

        {response && response.matches.length === 0 && (
          <div className="cm-empty">
            No investor memory embeddings cleared the current threshold.
          </div>
        )}

        {response && response.matches.length > 0 && (
          <div className="cm-match-list">
            {response.matches.map((match, index) => {
              const signals = signalList(match);
              return (
                <article
                  className="cm-match-card cm-match-card-clickable"
                  key={match.airtable_id}
                  role="link"
                  tabIndex={0}
                  onClick={() => {
                    window.location.href = investorProfileHref(match);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      window.location.href = investorProfileHref(match);
                    }
                  }}
                  aria-label={`Open ${match.name} investor profile`}
                >
                  <div className="cm-rank">{index + 1}</div>
                  <div className="cm-match-main">
                    <div className="cm-match-topline">
                      <div>
                        <h3>
                          <UserRound size={16} /> {match.name}
                        </h3>
                        <p>{match.related_organization ?? "No organization"}</p>
                      </div>
                      <div className="cm-score">{fmtScore(match.similarity)}</div>
                    </div>

                    {signals.length > 0 && (
                      <div className="cm-signal-row">
                        {signals.map((signal) => (
                          <span key={signal}>{signal}</span>
                        ))}
                      </div>
                    )}

                    {match.overview_text && (
                      <p className="cm-overview">{match.overview_text}</p>
                    )}

                    <div className="cm-match-footer">
                      <span>{match.note_count} notes</span>
                      {match.last_note_at && (
                        <span>Last note {new Date(match.last_note_at).toLocaleDateString()}</span>
                      )}
                      {match.linkedin && (
                        <a
                          href={match.linkedin}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          LinkedIn <ExternalLink size={12} />
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
    </div>
  );
}
