// 入社書類のうち、外国人本人から送ってもらう書類（マイナンバー・通帳の見開き・扶養証明書・履歴書・
// フリガナがわかる書類）がまだ無いとき、本人へ「送ってください」と頼む文面を日本語＋母国語で作る。
// 在留資格変更の申請をしたあとに必ず本人へ尋ねる運用なので、外国人詳細の入社書類で
// 変更申請の人にだけ出し、コピーして Messenger などに貼る。

import type { Application } from "@/types/application";
import { RESUME_LANG_JA, type ResumeLang } from "@/lib/resume-tool/i18n";

// 本人から送ってもらう書類（入社書類の一覧の並び）
export const ONBOARDING_REQUEST_DOC_KEYS = ["mynumber", "tsuchou", "fuyo", "rirekisho", "furigana"] as const;
export type OnboardingRequestDocKey = (typeof ONBOARDING_REQUEST_DOC_KEYS)[number];

// 書類の名前（言語ごと）。日本語は入社書類の一覧より少し説明を足してある
const DOC_NAMES: Record<ResumeLang, Record<OnboardingRequestDocKey, string>> = {
  ja: {
    mynumber: "マイナンバー（個人番号カード、または通知カードの写真）",
    tsuchou: "通帳の見開き（銀行名・支店名・口座番号・名義がわかるページ）",
    fuyo: "扶養証明書（家族関係がわかる書類：出生証明書・結婚証明書など）",
    rirekisho: "履歴書",
    furigana: "フリガナがわかる書類（前の会社の健康保険証・年金手帳など、名前のカタカナがわかるもの）",
  },
  en: {
    mynumber: "My Number (a photo of your Individual Number Card or notification card)",
    tsuchou: "Bankbook (the page showing the bank name, branch, account number and account holder's name)",
    fuyo: "Dependent certificate (documents showing your family relationship, such as a birth certificate or marriage certificate)",
    rirekisho: "Resume (履歴書)",
    furigana: "A document showing your name in katakana (for example, the health insurance card or pension book from your previous company)",
  },
  vi: {
    mynumber: "Mã số cá nhân My Number (ảnh thẻ My Number hoặc giấy thông báo mã số)",
    tsuchou: "Sổ ngân hàng (trang có tên ngân hàng, chi nhánh, số tài khoản và tên chủ tài khoản)",
    fuyo: "Giấy chứng nhận người phụ thuộc (giấy tờ chứng minh quan hệ gia đình: giấy khai sinh, giấy đăng ký kết hôn, v.v.)",
    rirekisho: "Sơ yếu lý lịch (履歴書)",
    furigana: "Giấy tờ có tên bạn bằng chữ Katakana (thẻ bảo hiểm y tế, sổ lương hưu của công ty trước, v.v.)",
  },
  id: {
    mynumber: "My Number (foto kartu My Number atau kartu pemberitahuan nomor)",
    tsuchou: "Buku tabungan (halaman yang menunjukkan nama bank, cabang, nomor rekening dan nama pemilik rekening)",
    fuyo: "Surat keterangan tanggungan (dokumen hubungan keluarga: akta kelahiran, akta nikah, dll.)",
    rirekisho: "Riwayat hidup (履歴書)",
    furigana: "Dokumen yang menunjukkan nama Anda dalam katakana (kartu asuransi kesehatan atau buku pensiun dari perusahaan sebelumnya, dll.)",
  },
  km: {
    mynumber: "លេខ My Number (រូបថតកាត My Number ឬក្រដាសជូនដំណឹងលេខ)",
    tsuchou: "សៀវភៅធនាគារ (ទំព័រដែលមានឈ្មោះធនាគារ សាខា លេខគណនី និងឈ្មោះម្ចាស់គណនី)",
    fuyo: "លិខិតបញ្ជាក់អ្នកក្នុងបន្ទុក (ឯកសារបង្ហាញទំនាក់ទំនងគ្រួសារ៖ សំបុត្រកំណើត សំបុត្រអាពាហ៍ពិពាហ៍ ។ល។)",
    rirekisho: "ប្រវត្តិរូប (履歴書)",
    furigana: "ឯកសារដែលមានឈ្មោះអ្នកជាអក្សរកាតាកាណា (ប័ណ្ណធានារ៉ាប់រងសុខភាព ឬសៀវភៅសោធននិវត្តន៍ពីក្រុមហ៊ុនមុន ។ល។)",
  },
  tl: {
    mynumber: "My Number (larawan ng inyong My Number card o notification card)",
    tsuchou: "Bankbook (ang pahina na may pangalan ng bangko, branch, account number at pangalan ng may-ari)",
    fuyo: "Dependent certificate (mga dokumentong nagpapakita ng relasyon sa pamilya: birth certificate, marriage certificate, atbp.)",
    rirekisho: "Resume (履歴書)",
    furigana: "Dokumentong nagpapakita ng pangalan mo sa katakana (health insurance card o pension book mula sa dating kumpanya, atbp.)",
  },
};

// 前置き・結び（言語ごと）
const TEXT: Record<ResumeLang, { intro: (name: string) => string; outro: string }> = {
  ja: {
    intro: (name) =>
      `${name ? `${name}さん\n` : ""}在留資格変更の申請をしました。入社の手続きのため、次の書類の写真（または PDF）を送ってください。`,
    outro: "よろしくお願いします。",
  },
  en: {
    intro: (name) =>
      `${name ? `Hello ${name},\n` : ""}We have submitted your application to change your status of residence. For your onboarding, please send us photos (or PDF files) of the following documents.`,
    outro: "Thank you.",
  },
  vi: {
    intro: (name) =>
      `${name ? `Chào ${name},\n` : ""}Chúng tôi đã nộp đơn xin thay đổi tư cách lưu trú của bạn. Để làm thủ tục vào công ty, vui lòng gửi ảnh (hoặc file PDF) của các giấy tờ sau.`,
    outro: "Cảm ơn bạn.",
  },
  id: {
    intro: (name) =>
      `${name ? `Halo ${name},\n` : ""}Kami sudah mengajukan permohonan perubahan status tinggal Anda. Untuk proses masuk kerja, mohon kirimkan foto (atau file PDF) dokumen berikut.`,
    outro: "Terima kasih.",
  },
  km: {
    intro: (name) =>
      `${name ? `សួស្តី ${name},\n` : ""}យើងបានដាក់ពាក្យសុំផ្លាស់ប្តូរស្ថានភាពស្នាក់នៅរបស់អ្នកហើយ។ សម្រាប់នីតិវិធីចូលធ្វើការ សូមផ្ញើរូបថត (ឬឯកសារ PDF) នៃឯកសារខាងក្រោម។`,
    outro: "សូមអរគុណ។",
  },
  tl: {
    intro: (name) =>
      `${name ? `Kumusta ${name},\n` : ""}Naisumite na namin ang inyong aplikasyon para sa pagpapalit ng status of residence. Para sa onboarding, pakipadala po ang larawan (o PDF file) ng mga sumusunod na dokumento.`,
    outro: "Maraming salamat po.",
  },
};

// まだ送ってもらっていない書類（添付が無いもの）。入社書類の一覧の並びで返す
export function missingRequestDocKeys(hasFile: (key: string) => boolean): OnboardingRequestDocKey[] {
  return ONBOARDING_REQUEST_DOC_KEYS.filter((k) => !hasFile(k));
}

// 1つの言語の文面
export function onboardingRequestText(lang: ResumeLang, keys: readonly OnboardingRequestDocKey[], name = ""): string {
  const t = TEXT[lang];
  const list = keys.map((k, i) => `${i + 1}. ${DOC_NAMES[lang][k]}`).join("\n");
  return `${t.intro(name.trim())}\n\n${list}\n\n${t.outro}`;
}

// 日本語＋母国語の文面（母国語が日本語なら日本語だけ）
export function onboardingRequestMessage(lang: ResumeLang, keys: readonly OnboardingRequestDocKey[], name = ""): string {
  const ja = onboardingRequestText("ja", keys, name);
  if (lang === "ja") return ja;
  return `${ja}\n\n----------\n\n${onboardingRequestText(lang, keys, name)}`;
}

// 言語の表示名（選択肢用）
export function requestLangLabel(lang: ResumeLang): string {
  return RESUME_LANG_JA[lang];
}

// いちばん新しい（取下げでない）申請が在留資格変更か。変更申請のあとに本人へ書類を尋ねる運用のため
export function isChangeApplication(
  applications: Pick<Application, "applicationContent" | "status" | "withdrawnOn">[],
): boolean {
  const latest = applications.find((a) => a.status !== "取下げ" && !a.withdrawnOn);
  return !!latest && /在留資格の変更/.test(latest.applicationContent ?? "");
}
