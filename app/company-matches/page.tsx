import { AppShell } from "@/app/components/AppShell";
import { CompanyInvestorMatcher } from "@/app/components/CompanyInvestorMatcher";
import { getCompanies } from "@/app/lib/companies";
import { getMembers } from "@/app/lib/members";

export default async function CompanyMatchesPage() {
  const [members, companies] = await Promise.all([getMembers(), getCompanies()]);

  return (
    <AppShell active="company-matches" membersCount={members.length}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Company matching</p>
          <h1>Company Matches</h1>
        </div>
        <p className="topbar-desc">
          Select a company from Airtable and rank investor fit from member memory embeddings.
        </p>
      </header>
      <CompanyInvestorMatcher companies={companies} />
    </AppShell>
  );
}
