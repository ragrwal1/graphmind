"use client";

import type { HybridSearchItem, ResultType } from "@/app/lib/hybridSearch";

// Re-export for consumers that imported from the old location
export type { HybridSearchItem, ResultType };

const TYPE_META: Record<ResultType, { label: string; className: string }> = {
  investor: { label: "Investor", className: "mobile-result-badge-investor" },
  company:  { label: "Company",  className: "mobile-result-badge-company"  },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getSubtitle(item: HybridSearchItem): string | null {
  if (item.resultType === "investor") {
    return item.related_organization ?? null;
  }
  // company
  return item.vertical ?? null;
}

type Props = {
  results: HybridSearchItem[];
  loading: boolean;
  query: string;
  onSelect: (item: HybridSearchItem) => void;
};

export function MobileResultList({ results, loading, query, onSelect }: Props) {
  if (loading) {
    return (
      <div className="mobile-investor-state">
        <span className="mobile-investor-spinner" />
      </div>
    );
  }

  if (query && results.length === 0) {
    return (
      <div className="mobile-investor-state">
        <p>No results match <em>"{query}"</em></p>
      </div>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className="mobile-investor-list">
      {!query && (
        <p className="mobile-investor-list-label">Recent members</p>
      )}
      {results.map((item) => {
        const meta = TYPE_META[item.resultType];
        const subtitle = getSubtitle(item);
        return (
          <button
            key={`${item.resultType}-${item.airtable_id}`}
            className="mobile-result-row"
            onClick={() => onSelect(item)}
          >
            {/* Avatar */}
            <span className={`mobile-result-avatar mobile-result-avatar-${item.resultType}`}>
              {getInitials(item.name)}
            </span>

            {/* Name + subtitle */}
            <span className="mobile-result-body">
              <span className="mobile-result-name">{item.name}</span>
              {subtitle && (
                <span className="mobile-result-org">{subtitle}</span>
              )}
            </span>

            {/* Type badge */}
            <span className={`mobile-result-type-badge ${meta.className}`}>
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
