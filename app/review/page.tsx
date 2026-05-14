import { AppShell } from "@/app/components/AppShell";
import { getMembers } from "@/app/lib/members";

export default async function ReviewPage() {
  const members = await getMembers();

  return (
    <AppShell active="review" membersCount={members.length}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Review queue</p>
          <h1>Member review</h1>
        </div>
      </header>
      <p className="empty-state">Review queue coming soon.</p>
    </AppShell>
  );
}
