import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listPostings } from "@/lib/supabase/queries/postings";
import { postingDisplayName } from "@/lib/posting-output";
import { toGridPosting, type GridPosting } from "@/lib/posting-grid";
import { FlyerClient, type FlyerItem } from "./FlyerClient";

export const dynamic = "force-dynamic";

export default async function PostingsFlyerPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const postings = await listPostings(supabase).catch(() => []);
  // 募集中を優先して掲載候補にする
  const open = postings.filter((p) => p.status === "募集中");
  const source = open.length > 0 ? open : postings;

  const items: FlyerItem[] = source.map((p) => ({
    id: p.id,
    company: postingDisplayName(p, p.organizations?.name),
    grid: toGridPosting(p) as GridPosting,
  }));

  return <FlyerClient items={items} />;
}
