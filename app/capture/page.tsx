import { AppShell } from "@/app/components/AppShell";
import { VoiceCapturePanel } from "@/app/components/VoiceCapturePanel";
import { getMembers } from "@/app/lib/members";

export default async function CapturePage() {
  const members = await getMembers();

  return (
    <AppShell active="capture" membersCount={members.length}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Voice capture</p>
          <h1>Record member updates</h1>
        </div>
      </header>
      <VoiceCapturePanel />
    </AppShell>
  );
}
