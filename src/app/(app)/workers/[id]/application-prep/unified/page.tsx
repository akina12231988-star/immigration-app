import { PrepPage } from "../PrepPage";

export const dynamic = "force-dynamic";

// 申請書類作成をアプリ一本化計画（試験中）の申請準備の詳細。
// 管理者だけが開ける。それ以外の人には「見つかりません」になる
export default async function UnifiedApplicationPrepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrepPage id={id} unified />;
}
