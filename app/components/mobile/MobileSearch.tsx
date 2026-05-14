"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Home } from "lucide-react";
import type { HybridSearchItem, ResultType } from "@/app/lib/hybridSearch";
import type { CompanySeed } from "@/app/lib/companies";
import type { MemberSeed } from "@/app/lib/members";
import { MobileResultList } from "./MobileResultList";
import { MobileInvestorCard } from "./MobileInvestorCard";
import { MobileCompanyCard } from "./MobileCompanyCard";

// ── Segmented control ────────────────────────────────────────────────────────
type SearchType = "companies" | "both" | "investors";

const SEGMENTS: { label: string; value: SearchType; bg: string; color: string }[] = [
  { label: "Companies", value: "companies", bg: "#8c1d40", color: "#ffffff" },
  { label: "Both",      value: "both",      bg: "#1c1008", color: "#f8f4ee" },
  { label: "Investors", value: "investors", bg: "#ffc627", color: "#1c1008" },
];

// Map SearchType → ResultType[] for the /api/search endpoint
const TYPE_MAP: Record<SearchType, ResultType[]> = {
  companies: ["company"],
  investors: ["investor"],
  both:      ["investor", "company"],
};

// ── Selected result union ─────────────────────────────────────────────────────
type SelectedResult =
  | { kind: "investor"; data: MemberSeed }
  | { kind: "company";  data: CompanySeed };

// ── Props ─────────────────────────────────────────────────────────────────────
type Props =
  | { trigger: true; expanded?: false; onClose?: never }
  | { trigger?: false; expanded: true; onClose: () => void };

export function MobileSearch({ trigger, expanded, onClose }: Props) {
  const [searchType, setSearchType] = useState<SearchType>("both");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HybridSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SelectedResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIndex = SEGMENTS.findIndex((s) => s.value === searchType);

  // ── Fetch results whenever query or searchType changes ──────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const types = TYPE_MAP[searchType].join(",");
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&types=${encodeURIComponent(types)}`
        );
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchType]);

  // ── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (expanded) {
      setQuery("");
      setSelected(null);
      setResults([]);
    }
  }, [expanded]);

  // ── Handle result selection ────────────────────────────────────────────────
  function handleSelect(item: HybridSearchItem) {
    if (item.resultType === "investor") {
      setSelected({ kind: "investor", data: item as MemberSeed });
    } else {
      setSelected({ kind: "company", data: item as CompanySeed });
    }
  }

  // ── Trigger mode (collapsed search bar in home) ────────────────────────────
  if (trigger) {
    return (
      <div className="mobile-search-trigger">
        <Search size={20} strokeWidth={1.5} />
        <span>Search members</span>
      </div>
    );
  }

  // ── Card view — replaces overlay contents ──────────────────────────────────
  if (selected?.kind === "investor") {
    return (
      <MobileInvestorCard
        member={selected.data}
        onBack={() => setSelected(null)}
        onClose={onClose!}
      />
    );
  }

  if (selected?.kind === "company") {
    return (
      <MobileCompanyCard
        company={selected.data}
        onBack={() => setSelected(null)}
        onClose={onClose!}
      />
    );
  }

  // ── Search overlay ─────────────────────────────────────────────────────────
  return (
    <div className="mobile-search-overlay">
      {/* Search bar */}
      <div className="mobile-search-bar">
        <Search size={18} strokeWidth={1.5} className="mobile-search-icon" />
        <input
          type="search"
          placeholder="Search members & companies…"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="mobile-search-clear" onClick={onClose} aria-label="Go home">
          <Home size={18} strokeWidth={1.75} />
        </button>
      </div>

      {/* Segmented control */}
      <div className="mobile-seg-control" role="radiogroup" aria-label="Search scope">
        <div
          className="mobile-seg-indicator"
          style={{
            left: `calc(3px + ${selectedIndex} * ((100% - 6px) / 3))`,
            background: SEGMENTS[selectedIndex].bg,
          }}
        />
        {SEGMENTS.map((seg) => (
          <button
            key={seg.value}
            role="radio"
            aria-checked={searchType === seg.value}
            className="mobile-seg-option"
            style={{ color: searchType === seg.value ? seg.color : undefined }}
            onClick={() => setSearchType(seg.value)}
          >
            {seg.label}
          </button>
        ))}
      </div>

      {/* Results */}
      <MobileResultList
        results={results}
        loading={loading}
        query={query}
        onSelect={handleSelect}
      />
    </div>
  );
}
