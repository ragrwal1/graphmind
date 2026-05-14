"use client";

import type { CompanySeed } from "@/app/lib/companies";

// Map vertical names to a CSS class suffix for color coding
function verticalClass(vertical: string | null): string {
  if (!vertical) return "other";
  const v = vertical.toLowerCase();
  if (v.includes("ai") || v.includes("machine learning") || v.includes("ml")) return "ai";
  if (v.includes("clean") || v.includes("energy") || v.includes("climate")) return "cleantech";
  if (v.includes("health") || v.includes("bio") || v.includes("medtech") || v.includes("life science")) return "health";
  if (v.includes("defense") || v.includes("aerospace") || v.includes("security") || v.includes("cyber")) return "defense";
  if (v.includes("fin") || v.includes("fintech") || v.includes("payments")) return "fintech";
  if (v.includes("ed") || v.includes("education")) return "edtech";
  if (v.includes("agri") || v.includes("food")) return "agritech";
  if (v.includes("real estate") || v.includes("proptech")) return "proptech";
  if (v.includes("saas") || v.includes("enterprise") || v.includes("b2b")) return "saas";
  return "other";
}

function diligenceClass(status: string | null): string {
  if (!status) return "unknown";
  const s = status.toLowerCase();
  if (s.includes("pass") || s.includes("decline") || s.includes("reject")) return "passed";
  if (s.includes("active") || s.includes("diligence") || s.includes("review")) return "active";
  if (s.includes("portfolio") || s.includes("invested") || s.includes("funded")) return "portfolio";
  if (s.includes("finalist") || s.includes("semi")) return "finalist";
  return "other";
}

type Props = {
  company: CompanySeed;
};

export function CompanyOverviewSection({ company }: Props) {
  return (
    <section className="mobile-card-section">
      <h3 className="mobile-card-section-title">Overview</h3>

      <div className="mobile-company-overview-content">
        {/* Vertical + Stage pills */}
        <div className="mobile-company-pill-row">
          {company.vertical && (
            <span className={`mobile-vertical-pill mobile-vertical-pill-${verticalClass(company.vertical)}`}>
              {company.vertical}
            </span>
          )}
          {company.stage && (
            <span className="mobile-stage-pill">{company.stage}</span>
          )}
          {company.diligence_status && (
            <span className={`mobile-diligence-pill mobile-diligence-pill-${diligenceClass(company.diligence_status)}`}>
              {company.diligence_status}
            </span>
          )}
        </div>

        {/* Description */}
        {company.description ? (
          <p className="mobile-company-description">{company.description}</p>
        ) : (
          <p className="mobile-card-section-empty">No description available.</p>
        )}
      </div>
    </section>
  );
}
