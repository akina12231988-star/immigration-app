"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PostingForm } from "@/components/postings/PostingForm";
import { createClient } from "@/lib/supabase/client";
import { insertPosting } from "@/lib/supabase/queries/postings";
import type { Organization } from "@/types/db";
import type { JobPostingInput } from "@/types/recruiting";

export function NewPostingForm({ organizations }: { organizations: Organization[] }) {
  const router = useRouter();

  if (organizations.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted">
        先に「会社・機関マスタ」で所属先を登録してください。求人はその機関に紐づけて登録します。
      </Card>
    );
  }

  const handleSubmit = async (input: JobPostingInput) => {
    const posting = await insertPosting(createClient(), input);
    router.push(`/postings/${posting.id}`);
    router.refresh();
  };

  return (
    <PostingForm
      initial={null}
      organizations={organizations}
      submitLabel="登録する"
      onSubmit={handleSubmit}
    />
  );
}
