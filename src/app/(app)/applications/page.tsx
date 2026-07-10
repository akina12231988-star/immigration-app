"use client";

import { AppHeader } from "@/components/AppHeader";
import { useApplications } from "@/lib/application-store";
import { ApplicationsExplorer } from "./ApplicationsExplorer";

export default function ApplicationsPage() {
  const { applications } = useApplications();

  return (
    <div className="-mx-4 -mt-4">
      <AppHeader title="申請一覧" />
      <div className="px-4 pt-4">
        <ApplicationsExplorer applications={applications} />
      </div>
    </div>
  );
}
