import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { TodoCorrections } from "@/components/todos/TodoCorrections";
import { displayTodoNo } from "@/lib/todo";

export const dynamic = "force-dynamic";

// 申請書類の訂正記録（チェック後）のページ。
// 申請準備のTODOの行が長くならないよう、行のボタンからこのページで記録する
export default async function TodoCorrectionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("todos")
    .select("id, todo_no, title, worker_id, workers(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const todo = data as unknown as {
    id: string;
    todo_no: string;
    title: string;
    worker_id: string | null;
    workers: { name: string } | null;
  };

  const who = todo.workers?.name ?? todo.title ?? "";

  return (
    <>
      <AppHeader
        title={`${displayTodoNo(todo.todo_no)}${who ? `　${who}` : ""}｜申請書類の訂正記録`}
        backHref="/workers/renewals"
      />
      <div className="px-4 pb-10 pt-4 md:px-8">
        <p className="mb-3 text-xs leading-relaxed text-muted">
          チェック後に見つかった訂正を、訂正書類名・訂正箇所の画像・訂正内容で残せます。
        </p>
        <TodoCorrections todoId={todo.id} canEdit={me.role !== "viewer"} defaultOpen />
      </div>
    </>
  );
}
