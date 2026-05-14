import { AppShell } from "@/app/components/AppShell";
import { MemberExplorer } from "@/app/components/MemberExplorer";
import { getMembers } from "@/app/lib/members";

type HomeProps = {
  searchParams?: Promise<{
    member?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const members = await getMembers();

  return (
    <AppShell active="search" membersCount={members.length}>
      <MemberExplorer members={members} initialSelectedId={params?.member} />
    </AppShell>
  );
}
