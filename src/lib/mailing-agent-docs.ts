// 郵送請求の代理人（職員）の身分証明書（0186）。
//
// 代理人として郵送請求するときは、代理人の本人確認書類の写しを同封する。
// 代理人の名前ごとに登録した身分証明書を、郵送請求の画面で代理人を入力したときに引き当てる。
// 名前は「野口明菜」「野口 明菜」「野口明菜（行政書士事務所）」のように書き方がぶれるので、
// 空白・全角半角・括弧の中を取り除いて比べる。画面から切り出して単体テストできるようにしている。

export interface MailingAgentDocument {
  id: string;
  agent_name: string;
  label: string; // 書類の種類（運転免許証（表）など）
  storage_path: string;
  file_name: string;
  mime_type: string;
  created_at: string;
}

// 名前を比べるためのキー（空白・括弧の中・敬称を除き、全角半角をそろえる）
export function agentNameKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFKC")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s　]+/g, "")
    .replace(/(様|さん|氏)$/, "")
    .trim();
}

// その代理人の身分証明書（登録した順）
export function docsForAgent(docs: MailingAgentDocument[], agentName: string): MailingAgentDocument[] {
  const key = agentNameKey(agentName);
  if (!key) return [];
  return docs
    .filter((d) => agentNameKey(d.agent_name) === key)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// 登録されている代理人の名前（重複なし・登録順）
export function agentNames(docs: MailingAgentDocument[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of [...docs].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = agentNameKey(d.agent_name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(d.agent_name.trim());
  }
  return out;
}
