import { PrepPage } from "./PrepPage";

export const dynamic = "force-dynamic";

// 申請準備の詳細（書類チェックリスト）のページ（中身は PrepPage.tsx）
export default async function ApplicationPrepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrepPage id={id} unified={false} />;
}
