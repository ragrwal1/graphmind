"use client";

import { useRef, useState } from "react";
import {
  Search,
  Zap,
  Clock,
  BarChart2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Building2,
  User,
} from "lucide-react";
import type { HybridSearchItem, HybridSearchResponse, ResultType } from "@/app/lib/hybridSearch";

// ── Types ──────────────────────────────────────────────────────────────────────

type LogEntry = {
  ts: number;         // ms since search start
  wall: string;       // HH:MM:SS.mmm
  level: "info" | "ok" | "warn" | "data";
  msg: string;
};

type HistoryEntry = {
  id: string;
  query: string;
  types: ResultType[];
  response: HybridSearchResponse;
  logEntries: LogEntry[];
  at: Date;
};

type WorkbenchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "done"; response: HybridSearchResponse; logEntries: LogEntry[] }
  | { status: "error"; message: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

function wallTime(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function scoreBar(score: number, max: number, cls: string) {
  const pct = max > 0 ? Math.min((score / max) * 100, 100) : 0;
  return (
    <div className="wb-score-bar-bg">
      <div className={`wb-score-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SearchWorkbench() {
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<Record<ResultType, boolean>>({
    investor: true,
    company: true,
  });
  const [limit, setLimit] = useState(20);
  const [state, setState] = useState<WorkbenchState>({ status: "idle" });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [rawExpanded, setRawExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedTypes = Object.entries(types)
    .filter(([, v]) => v)
    .map(([k]) => k as ResultType);

  // ── Run search ───────────────────────────────────────────────────────────────

  async function runSearch(overrideQuery?: string) {
    const q = (overrideQuery ?? query).trim();
    if (selectedTypes.length === 0) return;

    const logs: LogEntry[] = [];
    const t0 = Date.now();

    const log = (msg: string, level: LogEntry["level"] = "info") => {
      logs.push({ ts: Date.now() - t0, wall: wallTime(), level, msg });
    };

    setState({ status: "loading", query: q });
    setExpandedResults(new Set());

    log(`Query: "${q}"`, "info");
    log(`Types: ${selectedTypes.join(", ")} · limit: ${limit}`, "info");
    log("Fetching /api/search…", "info");

    try {
      const url = `/api/search?q=${encodeURIComponent(q)}&types=${encodeURIComponent(
        selectedTypes.join(",")
      )}&limit=${limit}`;

      log(`GET ${url}`, "data");

      const res = await fetch(url);
      const data: HybridSearchResponse = await res.json();

      log(`HTTP ${res.status} received`, res.ok ? "ok" : "warn");

      if (!res.ok) {
        log("Request failed", "warn");
        setState({ status: "error", message: `HTTP ${res.status}` });
        return;
      }

      const d = data.debug;

      log(`Mode: ${data.mode.toUpperCase()}`, data.mode === "hybrid" ? "ok" : "info");
      log(`Keyword: ${d.keyword_hits.investors} investors, ${d.keyword_hits.companies} companies (${fmtMs(d.timing.keyword_ms)})`, "data");

      if (d.embedding_used) {
        log(`Embedding generated (${fmtMs(d.timing.embedding_ms)}) — model: ${d.embedding_model}`, "ok");
        log(`Semantic: ${d.semantic_hits.investors} investors, ${d.semantic_hits.companies} companies (${fmtMs(d.timing.semantic_ms)})`, "data");
        log(`Semantic status: investors=${d.semantic_status.investors}, companies=${d.semantic_status.companies}`, "data");
        if (d.semantic_errors.investors) {
          log(d.semantic_errors.investors, "warn");
        }
        if (d.semantic_errors.companies) {
          log(d.semantic_errors.companies, "warn");
        }
      } else {
        log("Semantic skipped (no OpenAI key or query too short)", "warn");
      }

      log(`RRF merge: ${d.total_candidates} candidates → top ${data.results.length} (k=${d.rrf_k}) (${fmtMs(d.timing.merge_ms)})`, "data");
      log(`✓ Done in ${fmtMs(d.timing.total_ms)}`, "ok");

      data.results.forEach((r, i) => {
        const rrf = r.rrfScore?.toFixed(5) ?? "—";
        const kw = r.matchScore > 0 ? ` kw=${r.matchScore}` : "";
        const sem = r.semanticScore != null ? ` sem=${r.semanticScore.toFixed(3)}` : "";
        log(`  #${i + 1} [${r.resultType}] "${r.name}" rrf=${rrf}${kw}${sem}`, "data");
      });

      setState({ status: "done", response: data, logEntries: logs });

      const entry: HistoryEntry = {
        id: `${Date.now()}`,
        query: q,
        types: selectedTypes,
        response: data,
        logEntries: logs,
        at: new Date(),
      };
      setHistory((h) => [entry, ...h].slice(0, 8));
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : "Unknown error"}`, "warn");
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Request failed",
      });
    }
  }

  // ── Result expand/collapse ────────────────────────────────────────────────────

  function toggleResult(id: string) {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Copy raw JSON ────────────────────────────────────────────────────────────

  async function copyRaw() {
    if (state.status !== "done") return;
    await navigator.clipboard.writeText(JSON.stringify(state.response, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // ── Restore from history ─────────────────────────────────────────────────────

  function restoreHistory(entry: HistoryEntry) {
    setQuery(entry.query);
    setTypes({ investor: false, company: false, ...Object.fromEntries(entry.types.map((t) => [t, true])) });
    setState({ status: "done", response: entry.response, logEntries: entry.logEntries });
  }

  // ── Derived display data ─────────────────────────────────────────────────────

  const response = state.status === "done" ? state.response : null;
  const logEntries =
    state.status === "done" ? state.logEntries :
    state.status === "loading" ? [{ ts: 0, wall: wallTime(), level: "info" as const, msg: `Searching for "${state.query}"…` }] :
    [];

  const maxKeywordScore = response
    ? Math.max(...response.results.map((r) => r.matchScore), 1)
    : 1;
  const maxRrf = response
    ? Math.max(...response.results.map((r) => r.rrfScore ?? 0), 0.01)
    : 0.01;

  return (
    <div className="wb-layout">

      {/* ── LEFT: Controls + Stats + History ── */}
      <aside className="wb-sidebar">

        {/* Query */}
        <div className="wb-panel">
          <h3 className="wb-panel-title">Query</h3>
          <form
            onSubmit={(e) => { e.preventDefault(); void runSearch(); }}
          >
            <div className="wb-search-input-wrap">
              <Search size={15} className="wb-search-icon" />
              <input
                ref={inputRef}
                className="wb-search-input"
                placeholder='e.g. "defense", "AI health"'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {/* Types */}
            <div className="wb-control-row">
              <span className="wb-label">Types</span>
              <div className="wb-type-checks">
                {(["investor", "company"] as ResultType[]).map((t) => (
                  <label key={t} className="wb-checkbox-label">
                    <input
                      type="checkbox"
                      checked={types[t]}
                      onChange={(e) =>
                        setTypes((prev) => ({ ...prev, [t]: e.target.checked }))
                      }
                    />
                    <span className={`wb-type-chip wb-type-chip-${t}`}>{t}s</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Limit */}
            <div className="wb-control-row">
              <span className="wb-label">Limit</span>
              <div className="wb-slider-row">
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="wb-slider"
                />
                <span className="wb-slider-value">{limit}</span>
              </div>
            </div>

            <button
              className="wb-run-btn"
              type="submit"
              disabled={state.status === "loading" || selectedTypes.length === 0}
            >
              {state.status === "loading" ? (
                <><RefreshCw size={14} className="wb-spin" /> Searching…</>
              ) : (
                <><Zap size={14} /> Run Search</>
              )}
            </button>
          </form>
        </div>

        {/* Stats */}
        {response && (
          <div className="wb-panel">
            <h3 className="wb-panel-title">
              <BarChart2 size={13} /> Stats
            </h3>
            <dl className="wb-stat-list">
              <div className="wb-stat-row">
                <dt>Mode</dt>
                <dd>
                  <span className={`wb-mode-badge wb-mode-badge-${response.mode}`}>
                    {response.mode}
                  </span>
                </dd>
              </div>
              <div className="wb-stat-row">
                <dt>Total time</dt>
                <dd>{fmtMs(response.debug.timing.total_ms)}</dd>
              </div>
              <div className="wb-stat-row">
                <dt>Keyword</dt>
                <dd>{fmtMs(response.debug.timing.keyword_ms)}</dd>
              </div>
              {response.debug.embedding_used && <>
                <div className="wb-stat-row">
                  <dt>Embedding</dt>
                  <dd>{fmtMs(response.debug.timing.embedding_ms)}</dd>
                </div>
                <div className="wb-stat-row">
                  <dt>Semantic</dt>
                  <dd>{fmtMs(response.debug.timing.semantic_ms)}</dd>
                </div>
                <div className="wb-stat-row">
                  <dt>Sem investors</dt>
                  <dd>
                    <span className={`wb-status-pill wb-status-${response.debug.semantic_status.investors}`}>
                      {response.debug.semantic_status.investors}
                    </span>
                  </dd>
                </div>
                <div className="wb-stat-row">
                  <dt>Sem companies</dt>
                  <dd>
                    <span className={`wb-status-pill wb-status-${response.debug.semantic_status.companies}`}>
                      {response.debug.semantic_status.companies}
                    </span>
                  </dd>
                </div>
              </>}
              <div className="wb-stat-row">
                <dt>RRF merge</dt>
                <dd>{fmtMs(response.debug.timing.merge_ms)}</dd>
              </div>
              <div className="wb-stat-row wb-stat-divider">
                <dt>KW investors</dt>
                <dd>{response.debug.keyword_hits.investors}</dd>
              </div>
              <div className="wb-stat-row">
                <dt>KW companies</dt>
                <dd>{response.debug.keyword_hits.companies}</dd>
              </div>
              {response.debug.embedding_used && <>
                <div className="wb-stat-row">
                  <dt>Sem inv hits</dt>
                  <dd>{response.debug.semantic_hits.investors}</dd>
                </div>
                <div className="wb-stat-row">
                  <dt>Sem co hits</dt>
                  <dd>{response.debug.semantic_hits.companies}</dd>
                </div>
              </>}
              <div className="wb-stat-row wb-stat-divider">
                <dt>Candidates</dt>
                <dd>{response.debug.total_candidates}</dd>
              </div>
              <div className="wb-stat-row">
                <dt>Returned</dt>
                <dd>{response.results.length}</dd>
              </div>
              <div className="wb-stat-row">
                <dt>RRF k</dt>
                <dd>{response.debug.rrf_k}</dd>
              </div>
              {response.debug.embedding_model && (
                <div className="wb-stat-row">
                  <dt>Model</dt>
                  <dd className="wb-stat-model">{response.debug.embedding_model}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="wb-panel">
            <div className="wb-panel-title-row">
              <h3 className="wb-panel-title">
                <Clock size={13} /> History
              </h3>
              <button className="wb-icon-btn" onClick={() => setHistory([])} title="Clear history">
                <Trash2 size={12} />
              </button>
            </div>
            <ul className="wb-history-list">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    className="wb-history-item"
                    onClick={() => restoreHistory(h)}
                  >
                    <span className="wb-history-query">"{h.query || "(empty)"}"</span>
                    <span className="wb-history-meta">
                      {h.response.results.length} results · {fmtMs(h.response.debug.timing.total_ms)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* ── CENTER: Results + Log ── */}
      <div className="wb-main">

        {/* Results */}
        <div className="wb-panel wb-results-panel">
          <div className="wb-panel-title-row">
            <h3 className="wb-panel-title">
              Results
              {response && (
                <span className="wb-result-count">{response.results.length}</span>
              )}
            </h3>
          </div>

          {state.status === "idle" && (
            <p className="wb-empty">Run a search to see results here.</p>
          )}
          {state.status === "loading" && (
            <div className="wb-loading">
              <RefreshCw size={18} className="wb-spin" />
              <span>Searching…</span>
            </div>
          )}
          {state.status === "error" && (
            <p className="wb-error">Error: {state.message}</p>
          )}

          {response && response.results.length === 0 && (
            <p className="wb-empty">No results for "{response.query}".</p>
          )}

          {response && response.results.map((item, idx) => {
            const id = `${item.resultType}-${item.airtable_id}`;
            const expanded = expandedResults.has(id);
            const subtitle =
              item.resultType === "investor"
                ? item.related_organization
                : item.vertical;

            return (
              <div key={id} className="wb-result-row">
                {/* Rank */}
                <span className="wb-rank">#{idx + 1}</span>

                {/* Type icon */}
                <span className={`wb-result-type-icon wb-result-type-icon-${item.resultType}`}>
                  {item.resultType === "investor"
                    ? <User size={12} />
                    : <Building2 size={12} />}
                </span>

                <div className="wb-result-body">
                  {/* Top row: name + badges */}
                  <div className="wb-result-top">
                    <button
                      className="wb-result-name"
                      onClick={() => toggleResult(id)}
                    >
                      {item.name}
                      {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    <div className="wb-result-badges">
                      <span className={`wb-result-badge wb-result-badge-${item.resultType}`}>
                        {item.resultType}
                      </span>
                      {item.semanticScore != null && (
                        <span className="wb-result-badge wb-result-badge-sem">
                          sem
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Subtitle */}
                  {subtitle && (
                    <span className="wb-result-sub">{subtitle}</span>
                  )}

                  {/* Score bars */}
                  <div className="wb-scores">
                    <div className="wb-score-item">
                      <span className="wb-score-label">RRF</span>
                      {scoreBar(item.rrfScore ?? 0, maxRrf, "wb-bar-rrf")}
                      <span className="wb-score-num">{item.rrfScore?.toFixed(4) ?? "—"}</span>
                    </div>
                    {item.matchScore > 0 && (
                      <div className="wb-score-item">
                        <span className="wb-score-label">KW</span>
                        {scoreBar(item.matchScore, maxKeywordScore, "wb-bar-kw")}
                        <span className="wb-score-num">{item.matchScore}</span>
                      </div>
                    )}
                    {item.semanticScore != null && (
                      <div className="wb-score-item">
                        <span className="wb-score-label">Sem</span>
                        {scoreBar(item.semanticScore, 1, "wb-bar-sem")}
                        <span className="wb-score-num">{item.semanticScore.toFixed(3)}</span>
                      </div>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="wb-result-detail">
                      {item.matchedFields.length > 0 && (
                        <div className="wb-detail-row">
                          <span className="wb-detail-key">Matched fields</span>
                          <span className="wb-detail-val">
                            {item.matchedFields.map((f) => (
                              <span key={f} className="wb-field-tag">{f}</span>
                            ))}
                          </span>
                        </div>
                      )}
                      <div className="wb-detail-row">
                        <span className="wb-detail-key">airtable_id</span>
                        <span className="wb-detail-val wb-detail-mono">{item.airtable_id}</span>
                      </div>
                      {item.resultType === "investor" && item.email && (
                        <div className="wb-detail-row">
                          <span className="wb-detail-key">email</span>
                          <span className="wb-detail-val wb-detail-mono">{item.email}</span>
                        </div>
                      )}
                      {item.resultType === "company" && item.description && (
                        <div className="wb-detail-row">
                          <span className="wb-detail-key">description</span>
                          <span className="wb-detail-val">{item.description.slice(0, 300)}{item.description.length > 300 ? "…" : ""}</span>
                        </div>
                      )}
                      {item.resultType === "company" && (
                        <>
                          {item.stage && (
                            <div className="wb-detail-row">
                              <span className="wb-detail-key">stage</span>
                              <span className="wb-detail-val">{item.stage}</span>
                            </div>
                          )}
                          {item.diligence_status && (
                            <div className="wb-detail-row">
                              <span className="wb-detail-key">diligence</span>
                              <span className="wb-detail-val">{item.diligence_status}</span>
                            </div>
                          )}
                          {item.website && (
                            <div className="wb-detail-row">
                              <span className="wb-detail-key">website</span>
                              <a href={item.website.startsWith("http") ? item.website : `https://${item.website}`}
                                target="_blank" rel="noopener noreferrer"
                                className="wb-detail-link wb-detail-mono">
                                {item.website}
                              </a>
                            </div>
                          )}
                        </>
                      )}
                      {item.resultType === "investor" && item.aliases.length > 0 && (
                        <div className="wb-detail-row">
                          <span className="wb-detail-key">aliases</span>
                          <span className="wb-detail-val wb-detail-mono">{item.aliases.join(", ")}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Log */}
        <div className="wb-panel wb-log-panel">
          <h3 className="wb-panel-title">
            <Clock size={13} /> Execution Log
          </h3>
          {logEntries.length === 0 ? (
            <p className="wb-empty">Log appears here when you run a search.</p>
          ) : (
            <div className="wb-log">
              {logEntries.map((e, i) => (
                <div key={i} className={`wb-log-entry wb-log-${e.level}`}>
                  <span className="wb-log-ts">{e.wall}</span>
                  <span className="wb-log-delta">+{fmtMs(e.ts)}</span>
                  <span className="wb-log-msg">{e.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Raw JSON ── */}
      <div className="wb-raw-panel">
        <div className="wb-panel wb-raw-inner">
          <div className="wb-panel-title-row">
            <button
              className="wb-panel-title wb-raw-toggle"
              onClick={() => setRawExpanded((v) => !v)}
            >
              {rawExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Raw JSON
              {response && (
                <span className="wb-result-count">{response.results.length} items</span>
              )}
            </button>
            {response && (
              <button className="wb-icon-btn" onClick={() => void copyRaw()} title="Copy JSON">
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            )}
          </div>

          {rawExpanded && (
            <pre className="wb-raw-pre">
              {response
                ? JSON.stringify(response, null, 2)
                : "(no data yet)"}
            </pre>
          )}

          {!rawExpanded && response && (
            <div className="wb-raw-summary">
              <div className="wb-raw-summary-row">
                <span>query</span>
                <code>"{response.query}"</code>
              </div>
              <div className="wb-raw-summary-row">
                <span>mode</span>
                <code>{response.mode}</code>
              </div>
              <div className="wb-raw-summary-row">
                <span>results</span>
                <code>{response.results.length}</code>
              </div>
              <div className="wb-raw-summary-row">
                <span>total_ms</span>
                <code>{response.debug.timing.total_ms}</code>
              </div>
            </div>
          )}
        </div>

        {/* Quick-fire queries */}
        <div className="wb-panel">
          <h3 className="wb-panel-title">Quick queries</h3>
          <div className="wb-quick-queries">
            {[
              { label: "defense", q: "defense" },
              { label: "AI health", q: "AI health" },
              { label: "cleantech", q: "cleantech" },
              { label: "fintech", q: "fintech" },
              { label: "SaaS B2B", q: "SaaS B2B" },
              { label: "(empty)", q: "" },
            ].map(({ label, q }) => (
              <button
                key={label}
                className="wb-quick-btn"
                onClick={() => {
                  setQuery(q);
                  void runSearch(q);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Curl snippet */}
        {response && (
          <div className="wb-panel">
            <h3 className="wb-panel-title">cURL</h3>
            <pre className="wb-curl-pre">{`curl "http://localhost:3000/api/search?q=${encodeURIComponent(response.query)}&types=${response.types.join(",")}&limit=${response.debug.limit}"`}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
