"use client";

import { ArrowLeft, Home } from "lucide-react";
import type { CompanySeed } from "@/app/lib/companies";
import { CompanyOverviewSection } from "./company/CompanyOverviewSection";
import { CompanyDetailsSection } from "./company/CompanyDetailsSection";
import { CompanyInvestorMatchesSection } from "./company/CompanyInvestorMatchesSection";

// ─── Section registry ─────────────────────────────────────────
// Add new SectionIds here and handle them in renderSection() below.
type SectionId = "overview" | "matches" | "details";
const SECTIONS: SectionId[] = ["overview", "matches", "details"];
// ─────────────────────────────────────────────────────────────

type Props = {
  company: CompanySeed;
  onBack: () => void;
  onClose: () => void;
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

export function MobileCompanyCard({ company, onBack, onClose }: Props) {
  function renderSection(id: SectionId) {
    switch (id) {
      case "overview":
        return <CompanyOverviewSection key="overview" company={company} />;
      case "matches":
        return <CompanyInvestorMatchesSection key="matches" company={company} />;
      case "details":
        return <CompanyDetailsSection key="details" company={company} />;
    }
  }

  return (
    <div className="mobile-investor-card-overlay mobile-company-card-overlay">
      {/* Nav bar */}
      <div className="mobile-card-nav">
        <button className="mobile-card-back" onClick={onBack} aria-label="Back to results">
          <ArrowLeft size={20} strokeWidth={1.75} />
        </button>
        <button className="mobile-card-home" onClick={onClose} aria-label="Go home">
          <Home size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className="mobile-card-scroll">
        {/* Header */}
        <div className="mobile-card-header">
          <div className="mobile-card-avatar mobile-card-avatar-company">
            {getInitials(company.name)}
          </div>
          <h2 className="mobile-card-name">{company.name}</h2>
          {company.vertical && (
            <p className="mobile-card-org">{company.vertical}</p>
          )}
          {company.aliases.length > 1 && (
            <div className="mobile-card-aliases">
              {company.aliases.slice(1).map((alias) => (
                <span key={alias} className="mobile-card-alias-pill">
                  {alias}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pluggable sections */}
        {SECTIONS.map(renderSection)}
      </div>
    </div>
  );
}
