"use client";

import { useRouter } from "next/navigation";
import { WorkerForm } from "@/components/workers/WorkerForm";
import { createClient } from "@/lib/supabase/client";
import { insertWorker } from "@/lib/supabase/queries/workers";
import type { Organization, WorkerInput } from "@/types/db";

export function NewWorkerForm({ organizations }: { organizations: Organization[] }) {
  const router = useRouter();

  const handleSubmit = async (input: WorkerInput) => {
    const worker = await insertWorker(createClient(), input);
    router.push(`/workers/${worker.id}`);
    router.refresh();
  };

  return (
    <WorkerForm
      initial={null}
      organizations={organizations}
      submitLabel="登録する"
      onSubmit={handleSubmit}
    />
  );
}
