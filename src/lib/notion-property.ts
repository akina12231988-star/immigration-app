// Notionのプロパティ型に応じた書き込み値の組み立て。
// notion-actions（Notionに登録／更新）から使う。対応外の型は null（書き込まない）。
//
// select は名前で書くと選択肢が無ければ自動で作られるためそのまま書く。
// status は存在しない選択肢を書くとページ更新全体が失敗するため、
// Notion側の選択肢に同じ名前があるときだけ書く。

export interface NotionPropertyDef {
  type: string;
  select?: { options?: { name: string }[] };
  status?: { options?: { name: string }[] };
}

export function toNotionProperty(
  def: NotionPropertyDef,
  value: string,
): Record<string, unknown> | null {
  switch (def.type) {
    case "title":
      return { title: [{ text: { content: value } }] };
    case "rich_text":
      return { rich_text: [{ text: { content: value } }] };
    case "url":
      return { url: value };
    case "email":
      return { email: value };
    case "phone_number":
      return { phone_number: value };
    case "date":
      return /^\d{4}-\d{2}-\d{2}/.test(value) ? { date: { start: value.slice(0, 10) } } : null;
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? { number: n } : null;
    }
    case "select": {
      // 「特定技能1号＜支援委託中＞・更新」のように併記された値は、selectでは1つしか
      // 持てないため、末尾（いちばん新しい状況）だけを書く。
      // Notionのselectはカンマを含む名前を作れない
      const parts = value
        .split("・")
        .map((s) => s.trim())
        .filter(Boolean);
      const name = parts.at(-1) ?? "";
      return !name || name.includes(",") ? null : { select: { name } };
    }
    case "multi_select": {
      // 併記された値は「・」で分けて、それぞれの選択肢として書く
      const names = value
        .split("・")
        .map((s) => s.trim())
        .filter((s) => s && !s.includes(","));
      return names.length > 0 ? { multi_select: names.map((name) => ({ name })) } : null;
    }
    case "status": {
      const exists = (def.status?.options ?? []).some((o) => o.name === value);
      return exists ? { status: { name: value } } : null;
    }
    default:
      return null; // relation / formula / rollup / files / checkbox など
  }
}
