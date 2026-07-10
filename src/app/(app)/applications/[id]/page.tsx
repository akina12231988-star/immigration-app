import { AppHeader } from "@/components/AppHeader";
import { ApplicationDetail } from "./ApplicationDetail";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="-mx-4 -mt-4">
      <AppHeader title="申請詳細" backHref="/applications" />
      <div className="px-4 pt-4">
        <ApplicationDetail id={id} />
      </div>
    </div>
  );
}
