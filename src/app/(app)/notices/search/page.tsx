import { AppHeader } from "@/components/AppHeader";
import { NoticeSearch } from "./NoticeSearch";

export default function NoticeSearchPage() {
  return (
    <div className="-mx-4 -mt-4 lg:-mx-8 lg:-mt-6">
      <AppHeader title="通知書受付" />
      <div className="px-4 pt-4">
        <NoticeSearch />
      </div>
    </div>
  );
}
