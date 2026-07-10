import { BottomNav } from "@/components/BottomNav";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { ApplicationsProvider } from "@/lib/application-store";

// ログイン後の主要画面共通シェル。ヘッダーは各ページ側で個別タイトルを出す。
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ApplicationsProvider>
      <div className="flex min-h-screen flex-col">
        <SyncStatusBanner />
        <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-8 pt-4">
          {children}
        </main>
        <BottomNav />
      </div>
    </ApplicationsProvider>
  );
}
