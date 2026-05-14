import { Database, FlaskConical, Handshake, Mic2, Search, UserRoundCheck } from "lucide-react";

type AppShellProps = {
  active: "search" | "capture" | "review" | "search-lab" | "company-matches";
  children: React.ReactNode;
  membersCount: number;
};

export function AppShell({ active, children, membersCount }: AppShellProps) {
  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-logo">
            <img src="/realmspark-logo.svg" alt="RealmSpark" />
          </span>
          <span className="brand-copy">
            <small>Member memory</small>
          </span>
        </div>
        <nav className="nav-list">
          <a className={`nav-item ${active === "search" ? "active" : ""}`} href="/">
            <Search size={17} aria-hidden="true" />
            Search
          </a>
          <a className={`nav-item ${active === "review" ? "active" : ""}`} href="/review">
            <UserRoundCheck size={17} aria-hidden="true" />
            Review Queue
          </a>
          <a className={`nav-item ${active === "capture" ? "active" : ""}`} href="/capture">
            <Mic2 size={17} aria-hidden="true" />
            Capture
          </a>
          <a className={`nav-item ${active === "search-lab" ? "active" : ""}`} href="/search-lab">
            <FlaskConical size={17} aria-hidden="true" />
            Search Lab
          </a>
          <a
            className={`nav-item ${active === "company-matches" ? "active" : ""}`}
            href="/company-matches"
          >
            <Handshake size={17} aria-hidden="true" />
            Company Matches
          </a>
        </nav>
        <div className="sidebar-stat">
          <Database size={17} aria-hidden="true" />
          <span>{membersCount} members</span>
        </div>
      </aside>

      <section className="workspace">{children}</section>
    </main>
  );
}
