import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { TodosClient } from "./TodosClient";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="TODO" backHref="/" />
      <TodosClient canEdit={me.role !== "viewer"} />
    </>
  );
}
