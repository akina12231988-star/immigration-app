// 会社からの書類の依頼のチェック表で「案内」を押したとき、本人へ送る案内文を
// 日本語＋母国語（国籍から決める）で自動で作る。コピーして Messenger などに貼る。
//
// 書類名は依頼の登録で自由に書かれるので、よくある書類（扶養控除等申告書・扶養証明書・
// 送金証明書・源泉徴収票 など）は内蔵の辞書で母国語にし、辞書に無い書類は日本語の名前を
// そのまま「 」で入れる（本人には日本語名で伝わる）。翻訳 API（ANTHROPIC_API_KEY）は使わない。

import type { ResumeLang } from "@/lib/resume-tool/i18n";
import { docNameReiwaYear, normalizeDocName } from "@/lib/org-document-requests";

export interface DocRequestTextItem {
  name: string; // 書類名（依頼の登録のまま）
  note: string; // 補足（コピーでよい など。翻訳せず各言語の文にそのまま付ける）
}

export interface DocRequestTextInput {
  workerName: string; // 本人の氏名（空なら呼びかけ無し）
  organizationName: string; // 依頼してきた会社（所属機関）
  dueOn: string | null; // 本人に伝える期限（空なら書かない）
  items: DocRequestTextItem[];
}

// 辞書にある書類の種類
export type DocWordKey =
  | "fuyokojo"
  | "fuyo"
  | "gensen"
  | "soukin"
  | "zairyu"
  | "shiteisho"
  | "mynumber"
  | "tsuchou"
  | "rirekisho"
  | "furigana"
  | "kenkoshindan"
  | "passport"
  | "juminhyo"
  | "kazei"
  | "nozei"
  | "hoken";

// 書類名（正規化後）に含まれていればその種類。上から順に見る（扶養控除 は 扶養証明 より先）
const DOC_WORD_PATTERNS: [RegExp, DocWordKey][] = [
  [/扶養控除/, "fuyokojo"],
  [/扶養/, "fuyo"],
  [/源泉徴収/, "gensen"],
  [/送金/, "soukin"],
  [/在留カード/, "zairyu"],
  [/指定書/, "shiteisho"],
  [/マイナンバー|個人番号/, "mynumber"],
  [/通帳/, "tsuchou"],
  [/履歴書/, "rirekisho"],
  [/フリガナ|ふりがな/, "furigana"],
  [/健康診断/, "kenkoshindan"],
  [/パスポート|旅券/, "passport"],
  [/住民票/, "juminhyo"],
  [/課税証明/, "kazei"],
  [/納税証明/, "nozei"],
  [/保険証/, "hoken"],
];

// 書類名から辞書の種類と年（源泉徴収票・送金証明書の「2026年」「令和8年」）を取り出す。辞書に無ければ null
export function docWordFor(name: string): { key: DocWordKey; year: number | null } | null {
  const n = normalizeDocName(name);
  for (const [re, key] of DOC_WORD_PATTERNS) {
    if (re.test(n)) {
      const reiwa = docNameReiwaYear(name);
      return { key, year: reiwa === null ? null : reiwa + 2018 };
    }
  }
  return null;
}

// 書類名の母国語（year は源泉徴収票・送金証明書の西暦）。日本語は依頼の書類名をそのまま使うので辞書に無い
const DOC_WORDS: Record<Exclude<ResumeLang, "ja">, Record<DocWordKey, (year: number | null) => string>> = {
  en: {
    fuyokojo: () => "Dependent exemption declaration form (扶養控除等申告書)",
    fuyo: () =>
      "Dependent certificate with Japanese translation (扶養証明書: documents proving your family relationship, such as a birth certificate or marriage certificate)",
    gensen: (y) => `Withholding tax slip (源泉徴収票)${y ? ` for ${y}` : ""}`,
    soukin: (y) => `Remittance certificate (送金証明書: proof of money sent to your family)${y ? ` for ${y}` : ""}`,
    zairyu: () => "Residence card (在留カード)",
    shiteisho: () => "Designation letter (指定書)",
    mynumber: () => "My Number (a photo of your Individual Number Card or notification card)",
    tsuchou: () => "Bankbook (the page showing the bank name, branch, account number and account holder's name)",
    rirekisho: () => "Resume (履歴書)",
    furigana: () => "A document showing your name in katakana (for example, the health insurance card or pension book from your previous company)",
    kenkoshindan: () => "Health check-up result (健康診断書)",
    passport: () => "Passport",
    juminhyo: () => "Certificate of residence (住民票)",
    kazei: () => "Taxation certificate (課税証明書)",
    nozei: () => "Tax payment certificate (納税証明書)",
    hoken: () => "Health insurance card (健康保険証)",
  },
  vi: {
    fuyokojo: () => "Tờ khai miễn trừ người phụ thuộc (扶養控除等申告書)",
    fuyo: () =>
      "Giấy chứng nhận người phụ thuộc kèm bản dịch tiếng Nhật (扶養証明書: giấy tờ chứng minh quan hệ gia đình như giấy khai sinh, giấy đăng ký kết hôn)",
    gensen: (y) => `Phiếu khấu trừ thuế tại nguồn (源泉徴収票)${y ? ` năm ${y}` : ""}`,
    soukin: (y) => `Giấy chứng nhận chuyển tiền (送金証明書: chứng từ gửi tiền cho gia đình)${y ? ` năm ${y}` : ""}`,
    zairyu: () => "Thẻ lưu trú (在留カード)",
    shiteisho: () => "Giấy chỉ định (指定書)",
    mynumber: () => "Mã số cá nhân My Number (ảnh thẻ My Number hoặc giấy thông báo mã số)",
    tsuchou: () => "Sổ ngân hàng (trang có tên ngân hàng, chi nhánh, số tài khoản và tên chủ tài khoản)",
    rirekisho: () => "Sơ yếu lý lịch (履歴書)",
    furigana: () => "Giấy tờ có tên bạn bằng chữ Katakana (thẻ bảo hiểm y tế, sổ lương hưu của công ty trước, v.v.)",
    kenkoshindan: () => "Kết quả khám sức khỏe (健康診断書)",
    passport: () => "Hộ chiếu",
    juminhyo: () => "Giấy chứng nhận cư trú (住民票)",
    kazei: () => "Giấy chứng nhận thuế (課税証明書)",
    nozei: () => "Giấy chứng nhận nộp thuế (納税証明書)",
    hoken: () => "Thẻ bảo hiểm y tế (健康保険証)",
  },
  id: {
    fuyokojo: () => "Formulir pernyataan tanggungan keluarga (扶養控除等申告書)",
    fuyo: () =>
      "Surat keterangan tanggungan beserta terjemahan bahasa Jepang (扶養証明書: dokumen hubungan keluarga seperti akta kelahiran atau akta nikah)",
    gensen: (y) => `Slip pemotongan pajak (源泉徴収票)${y ? ` tahun ${y}` : ""}`,
    soukin: (y) => `Bukti pengiriman uang (送金証明書: bukti kirim uang ke keluarga)${y ? ` tahun ${y}` : ""}`,
    zairyu: () => "Kartu izin tinggal (在留カード)",
    shiteisho: () => "Surat penunjukan (指定書)",
    mynumber: () => "My Number (foto kartu My Number atau kartu pemberitahuan nomor)",
    tsuchou: () => "Buku tabungan (halaman yang menunjukkan nama bank, cabang, nomor rekening dan nama pemilik rekening)",
    rirekisho: () => "Riwayat hidup (履歴書)",
    furigana: () => "Dokumen yang menunjukkan nama Anda dalam katakana (kartu asuransi kesehatan atau buku pensiun dari perusahaan sebelumnya, dll.)",
    kenkoshindan: () => "Hasil pemeriksaan kesehatan (健康診断書)",
    passport: () => "Paspor",
    juminhyo: () => "Surat keterangan domisili (住民票)",
    kazei: () => "Surat keterangan pajak (課税証明書)",
    nozei: () => "Surat keterangan pembayaran pajak (納税証明書)",
    hoken: () => "Kartu asuransi kesehatan (健康保険証)",
  },
  km: {
    fuyokojo: () => "ទម្រង់ប្រកាសអ្នកក្នុងបន្ទុក (扶養控除等申告書)",
    fuyo: () =>
      "លិខិតបញ្ជាក់អ្នកក្នុងបន្ទុក ជាមួយការបកប្រែជាភាសាជប៉ុន (扶養証明書៖ ឯកសារបង្ហាញទំនាក់ទំនងគ្រួសារ ដូចជាសំបុត្រកំណើត សំបុត្រអាពាហ៍ពិពាហ៍)",
    gensen: (y) => `ប័ណ្ណកាត់ទុកពន្ធ (源泉徴収票)${y ? ` ឆ្នាំ ${y}` : ""}`,
    soukin: (y) => `លិខិតបញ្ជាក់ការផ្ញើប្រាក់ (送金証明書៖ ភស្តុតាងផ្ញើប្រាក់ទៅគ្រួសារ)${y ? ` ឆ្នាំ ${y}` : ""}`,
    zairyu: () => "កាតស្នាក់នៅ (在留カード)",
    shiteisho: () => "លិខិតកំណត់ (指定書)",
    mynumber: () => "លេខ My Number (រូបថតកាត My Number ឬក្រដាសជូនដំណឹងលេខ)",
    tsuchou: () => "សៀវភៅធនាគារ (ទំព័រដែលមានឈ្មោះធនាគារ សាខា លេខគណនី និងឈ្មោះម្ចាស់គណនី)",
    rirekisho: () => "ប្រវត្តិរូប (履歴書)",
    furigana: () => "ឯកសារដែលមានឈ្មោះអ្នកជាអក្សរកាតាកាណា (ប័ណ្ណធានារ៉ាប់រងសុខភាព ឬសៀវភៅសោធននិវត្តន៍ពីក្រុមហ៊ុនមុន ។ល។)",
    kenkoshindan: () => "លទ្ធផលពិនិត្យសុខភាព (健康診断書)",
    passport: () => "លិខិតឆ្លងដែន",
    juminhyo: () => "លិខិតបញ្ជាក់លំនៅឋាន (住民票)",
    kazei: () => "លិខិតបញ្ជាក់ពន្ធ (課税証明書)",
    nozei: () => "លិខិតបញ្ជាក់ការបង់ពន្ធ (納税証明書)",
    hoken: () => "ប័ណ្ណធានារ៉ាប់រងសុខភាព (健康保険証)",
  },
  tl: {
    fuyokojo: () => "Dependent exemption declaration form (扶養控除等申告書)",
    fuyo: () =>
      "Dependent certificate na may Japanese translation (扶養証明書: mga dokumentong nagpapakita ng relasyon sa pamilya tulad ng birth certificate o marriage certificate)",
    gensen: (y) => `Withholding tax slip (源泉徴収票)${y ? ` para sa taong ${y}` : ""}`,
    soukin: (y) => `Remittance certificate (送金証明書: patunay ng pagpapadala ng pera sa pamilya)${y ? ` para sa taong ${y}` : ""}`,
    zairyu: () => "Residence card (在留カード)",
    shiteisho: () => "Designation letter (指定書)",
    mynumber: () => "My Number (larawan ng inyong My Number card o notification card)",
    tsuchou: () => "Bankbook (ang pahina na may pangalan ng bangko, branch, account number at pangalan ng may-ari)",
    rirekisho: () => "Resume (履歴書)",
    furigana: () => "Dokumentong nagpapakita ng pangalan mo sa katakana (health insurance card o pension book mula sa dating kumpanya, atbp.)",
    kenkoshindan: () => "Resulta ng health check-up (健康診断書)",
    passport: () => "Pasaporte",
    juminhyo: () => "Certificate of residence (住民票)",
    kazei: () => "Taxation certificate (課税証明書)",
    nozei: () => "Tax payment certificate (納税証明書)",
    hoken: () => "Health insurance card (健康保険証)",
  },
};

// 書類名のその言語での書き方。日本語は依頼の書類名のまま、辞書に無い書類は日本語名を「 」で入れる
export function docNameIn(lang: ResumeLang, name: string): string {
  const trimmed = name.trim();
  if (lang === "ja") return trimmed;
  const w = docWordFor(trimmed);
  return w ? DOC_WORDS[lang][w.key](w.year) : `「${trimmed}」`;
}

// 前置き・期限・結び（言語ごと）
const TEXT: Record<
  ResumeLang,
  { intro: (name: string, org: string) => string; due: (d: string) => string; outro: string }
> = {
  ja: {
    intro: (name, org) =>
      `${name ? `${name}さん\n` : ""}${org ? `${org}から、` : ""}次の書類の提出を求められています。`,
    due: (d) => `期限: ${d}まで`,
    outro: "用意できたら、写真（または PDF）をこちらに送ってください。\nわからないことがあれば聞いてください。よろしくお願いします。",
  },
  en: {
    intro: (name, org) =>
      `${name ? `Hello ${name},\n` : ""}${org ? `${org} has asked you` : "You have been asked"} to submit the following document(s).`,
    due: (d) => `Deadline: by ${d}`,
    outro: "When they are ready, please send us a photo (or PDF).\nIf you have any questions, please ask us. Thank you.",
  },
  vi: {
    intro: (name, org) =>
      `${name ? `Chào ${name},\n` : ""}${org ? `Công ty ${org} yêu cầu bạn` : "Bạn được yêu cầu"} nộp các giấy tờ sau.`,
    due: (d) => `Hạn nộp: trước ngày ${d}`,
    outro: "Khi chuẩn bị xong, vui lòng gửi ảnh (hoặc file PDF) cho chúng tôi.\nNếu có điều gì chưa rõ, hãy hỏi chúng tôi. Cảm ơn bạn.",
  },
  id: {
    intro: (name, org) =>
      `${name ? `Halo ${name},\n` : ""}${org ? `${org} meminta Anda` : "Anda diminta"} untuk menyerahkan dokumen berikut.`,
    due: (d) => `Batas waktu: sampai ${d}`,
    outro: "Jika sudah siap, mohon kirimkan foto (atau file PDF) kepada kami.\nJika ada yang kurang jelas, silakan tanyakan kepada kami. Terima kasih.",
  },
  km: {
    intro: (name, org) =>
      `${name ? `សួស្តី ${name},\n` : ""}${org ? `ក្រុមហ៊ុន ${org} ស្នើឱ្យអ្នក` : "អ្នកត្រូវបានស្នើឱ្យ"}ដាក់ឯកសារខាងក្រោម។`,
    due: (d) => `ថ្ងៃផុតកំណត់៖ ត្រឹមថ្ងៃ ${d}`,
    outro: "នៅពេលរៀបចំរួចរាល់ សូមផ្ញើរូបថត (ឬឯកសារ PDF) មកយើង។\nប្រសិនបើមានចម្ងល់ សូមសួរយើង។ សូមអរគុណ។",
  },
  tl: {
    intro: (name, org) =>
      `${name ? `Kumusta ${name},\n` : ""}${org ? `Hinihiling ng ${org} na` : "Hinihiling na"} isumite ninyo ang mga sumusunod na dokumento.`,
    due: (d) => `Deadline: hanggang ${d}`,
    outro: "Kapag handa na, pakipadala po sa amin ang larawan (o PDF file).\nKung may tanong po kayo, magtanong lang sa amin. Maraming salamat po.",
  },
};

// 1つの言語の文面
export function docRequestText(lang: ResumeLang, input: DocRequestTextInput): string {
  const t = TEXT[lang];
  const list = input.items
    .map((it, i) => {
      const note = it.note.trim();
      return `${i + 1}. ${docNameIn(lang, it.name)}${note ? `（${note}）` : ""}`;
    })
    .join("\n");
  const head = [t.intro(input.workerName.trim(), input.organizationName.trim())];
  if (input.dueOn) head.push(t.due(input.dueOn));
  return `${head.join("\n")}\n\n${list}\n\n${t.outro}`;
}

// 日本語＋母国語の文面（母国語が日本語なら日本語だけ）
export function docRequestMessage(lang: ResumeLang, input: DocRequestTextInput): string {
  const ja = docRequestText("ja", input);
  if (lang === "ja") return ja;
  return `${ja}\n\n----------\n\n${docRequestText(lang, input)}`;
}
