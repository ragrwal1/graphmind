"use client";

import { ExternalLink } from "lucide-react";
import type { CompanySeed } from "@/app/lib/companies";

type Props = {
  company: CompanySeed;
};

export function CompanyDetailsSection({ company }: Props) {
  const hasDetails =
    company.website ||
    company.fiscal_year ||
    company.source_organization ||
    company.contact_email;

  return (
    <section className="mobile-card-section">
      <h3 className="mobile-card-section-title">Details</h3>

      {!hasDetails ? (
        <p className="mobile-card-section-empty">No additional details.</p>
      ) : (
        <dl className="mobile-company-details-list">
          {company.website && (
            <div className="mobile-company-detail-row">
              <dt>Website</dt>
              <dd>
                <a
                  href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mobile-company-link"
                >
                  {company.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  <ExternalLink size={12} strokeWidth={1.75} />
                </a>
              </dd>
            </div>
          )}

          {company.fiscal_year && (
            <div className="mobile-company-detail-row">
              <dt>Fiscal Year</dt>
              <dd>{company.fiscal_year}</dd>
            </div>
          )}

          {company.source_organization && (
            <div className="mobile-company-detail-row">
              <dt>Source</dt>
              <dd>{company.source_organization}</dd>
            </div>
          )}

          {company.contact_email && (
            <div className="mobile-company-detail-row">
              <dt>Contact</dt>
              <dd>
                <a href={`mailto:${company.contact_email}`} className="mobile-company-link">
                  {company.contact_email}
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
