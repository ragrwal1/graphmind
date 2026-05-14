import { AppShell } from "@/app/components/AppShell";
import { SearchWorkbench } from "@/app/components/SearchWorkbench";
import { getMembers } from "@/app/lib/members";

export default async function SearchLabPage() {
  const members = await getMembers();

  return (
    <AppShell active="search-lab" membersCount={members.length}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Developer tooling</p>
          <h1>Search Lab</h1>
        </div>
        <p className="topbar-desc">
          Hybrid search workbench — keyword + semantic (pgvector RRF). Full debug output exposed.
        </p>
      </header>
      <SearchWorkbench />
    </AppShell>
  );
}
