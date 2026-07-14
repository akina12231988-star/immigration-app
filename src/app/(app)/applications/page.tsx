"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useApplications } from "@/lib/application-store";
import { isStatViewKey } from "@/lib/application-stats";
import { ApplicationsExplorer } from "./ApplicationsExplorer";

// useSearchParams は Suspense 境界の内側で使う必要がある
function ApplicationsPageInner() {
  const { applications } = useApplications();
  const viewParam = useSearchParams().get("view");
  const view = isStatViewKey(viewParam) ? viewParam : null;

  return (
    <div className="-mx-4 -mt-4 lg:-mx-8 lg:-mt-6">
      <AppHeader title="申請一覧" />
      <div className="px-4 pt-4">
        <ApplicationsExplorer applications={applications} initialView={view} />
      </div>
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense>
      <ApplicationsPageInner />
    </Suspense>
  );
}
