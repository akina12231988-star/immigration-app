// 履歴書ツール（/resume）を本人に案内するための文面とURL。
// 外国人一覧・外国人詳細・履歴書PDF取込の「履歴書を依頼」から使う。

import { RESUME_TEXT, type ResumeLang } from "./i18n";

export const RESUME_TOOL_PATH = "/resume";

export function resumeToolUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${RESUME_TOOL_PATH}`;
}

// 国籍の表記から、案内文の言語を推定する（分からなければ英語）
const NATIONALITY_LANGS: [ResumeLang, string[]][] = [
  ["vi", ["ベトナム", "ビエトナム", "VIETNAM", "VIET NAM"]],
  ["id", ["インドネシア", "INDONESIA"]],
  ["km", ["カンボジア", "CAMBODIA"]],
  ["tl", ["フィリピン", "PHILIPPINES", "PILIPINAS"]],
  ["ja", ["日本", "JAPAN"]],
];

export function resumeLangForNationality(nationality: string | null | undefined): ResumeLang {
  const upper = (nationality ?? "").trim().toUpperCase();
  if (!upper) return "en";
  for (const [lang, keywords] of NATIONALITY_LANGS) {
    if (keywords.some((kw) => upper.includes(kw.toUpperCase()))) return lang;
  }
  return "en";
}

// ツールの「日本語に翻訳してPDF保存」ボタンの、その言語での表示（絵文字を除く）
function pdfButtonLabel(lang: ResumeLang): string {
  return RESUME_TEXT[lang].pdf.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

// 本人へ送る案内文（その言語）。最後にURLを付ける
const INVITE: Record<ResumeLang, (btn: string) => string> = {
  ja: (btn) =>
    `履歴書を作ってください。\n下のリンクを開いて、あなたの言語を選んで入力し、最後に「${btn}」を押して、できたPDFをこちらに送ってください。`,
  en: (btn) =>
    `Please make your resume.\nOpen the link below, choose your language and fill in the form. Then press "${btn}" and send us the PDF.`,
  vi: (btn) =>
    `Vui lòng làm lý lịch (履歴書).\nMở đường link bên dưới, chọn ngôn ngữ của bạn và điền thông tin. Sau đó nhấn "${btn}" và gửi file PDF cho chúng tôi.`,
  id: (btn) =>
    `Mohon buat riwayat hidup (履歴書).\nBuka tautan di bawah, pilih bahasa Anda, lalu isi formulir. Setelah itu tekan "${btn}" dan kirimkan file PDF-nya kepada kami.`,
  km: (btn) =>
    `សូមបង្កើតប្រវត្តិរូប (履歴書)។\nបើកតំណខាងក្រោម ជ្រើសរើសភាសារបស់អ្នក ហើយបំពេញព័ត៌មាន។ បន្ទាប់មកចុច "${btn}" រួចផ្ញើឯកសារ PDF មកយើង។`,
  tl: (btn) =>
    `Pakigawa po ang inyong resume (履歴書).\nBuksan ang link sa ibaba, piliin ang inyong wika, at punan ang form. Pagkatapos ay pindutin ang "${btn}" at ipadala sa amin ang PDF.`,
};

export function resumeInviteMessage(lang: ResumeLang, url: string): string {
  return `${INVITE[lang](pdfButtonLabel(lang))}\n${url}`;
}
