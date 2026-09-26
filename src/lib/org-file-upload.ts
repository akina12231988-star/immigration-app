import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { createOrgFileTicket, registerOrgFile } from "@/app/(app)/organizations/actions";

// 所属機関の添付ファイル（農業特定技能加入通知書・定期報告書・賃金台帳など）を、所属機関の画面以外からも
// 同じ保存先（organization_files）へ入れる。所属機関の編集画面のアップロードと同じ手順
export async function uploadOrgFiles(orgId: string, kind: string, files: FileList | File[]): Promise<void> {
  for (const file of Array.from(files)) {
    const { blob, mimeType, fileName } = await compressImage(file);
    const ticket = await createOrgFileTicket(orgId, fileName, mimeType);
    if (!ticket.ok) throw new Error(ticket.message);
    const { error } = await createClient()
      .storage.from("app-files")
      .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: mimeType });
    if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);
    const res = await registerOrgFile(orgId, kind, ticket.path, fileName, mimeType);
    if (!res.ok) throw new Error(res.message);
  }
}
