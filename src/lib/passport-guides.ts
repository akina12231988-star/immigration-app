// 在日外国人向け・パスポート更新の案内文（日本語＋現地語）。
// LINE/Messenger でそのまま送れるよう、国籍ごとに定型文を用意する。
// 手続きの詳細は各国大使館・領事館で変わるため、公式サイトの確認を促す文面にしている。

export interface PassportGuide {
  nationality: string; // 表示用の国名（日本語）
  localLangLabel: string; // 現地語の名称
  officialName: string; // 在日大使館・領事館の名称
  officialUrl: string; // 公式サイト（本人に確認してもらう）
  ja: string; // 日本語の案内
  local: string; // 現地語の案内
}

const GUIDES: Record<string, PassportGuide> = {
  ベトナム: {
    nationality: "ベトナム",
    localLangLabel: "Tiếng Việt",
    officialName: "在日本ベトナム大使館 / 総領事館",
    officialUrl: "https://vnembassy-jp.org/",
    ja: `日本に住みながらパスポートを更新できます。
1. 在日本ベトナム大使館（東京）または大阪総領事館の公式サイトから、オンライン申請の予約をします。
2. 必要なもの: 現在のパスポート、在留カード、証明写真、申請書、手数料。
3. 郵送またはオンラインでの申請に対応している場合があります。まず公式サイトで最新の方法を確認してください。
公式サイト: https://vnembassy-jp.org/`,
    local: `Bạn có thể gia hạn hộ chiếu khi đang sống tại Nhật Bản.
1. Đặt lịch/đăng ký trực tuyến trên trang chính thức của Đại sứ quán Việt Nam tại Tokyo hoặc Tổng lãnh sự quán tại Osaka.
2. Giấy tờ cần: hộ chiếu hiện tại, thẻ lưu trú (zairyu card), ảnh thẻ, đơn xin cấp, lệ phí.
3. Có thể nộp qua bưu điện hoặc trực tuyến. Vui lòng kiểm tra cách mới nhất trên trang chính thức.
Trang chính thức: https://vnembassy-jp.org/`,
  },
  カンボジア: {
    nationality: "カンボジア",
    localLangLabel: "ភាសាខ្មែរ",
    officialName: "在日本カンボジア王国大使館",
    officialUrl: "https://www.embassyofcambodia.jp/",
    ja: `日本に住みながらパスポートを更新できます。
1. 在日本カンボジア王国大使館（東京）に連絡し、更新の予約・方法を確認します。
2. 必要なもの: 現在のパスポート、在留カード、証明写真、申請書、手数料。
3. 申請方法は大使館で変わることがあるため、事前に電話・メールで確認してください。
公式サイト: https://www.embassyofcambodia.jp/`,
    local: `អ្នកអាចបន្តសុពលភាពលិខិតឆ្លងដែនពេលកំពុងរស់នៅប្រទេសជប៉ុន។
1. ទាក់ទងស្ថានទូតកម្ពុជានៅទីក្រុងតូក្យូ ដើម្បីកក់ និងសួរអំពីនីតិវិធី។
2. ឯកសារត្រូវការ៖ លិខិតឆ្លងដែនបច្ចុប្បន្ន កាតស្នាក់នៅ (zairyu) រូបថត ពាក្យសុំ និងថ្លៃសេវា។
3. សូមផ្ទៀងផ្ទាត់ជាមួយស្ថានទូតជាមុន ព្រោះនីតិវិធីអាចផ្លាស់ប្តូរ។
គេហទំព័រផ្លូវការ៖ https://www.embassyofcambodia.jp/`,
  },
  フィリピン: {
    nationality: "フィリピン",
    localLangLabel: "Filipino",
    officialName: "在日本フィリピン共和国大使館",
    officialUrl: "https://tokyo.philembassy.net/",
    ja: `日本に住みながら電子パスポート（ePassport）を更新できます。
1. フィリピン大使館（東京）または総領事館の公式サイトからオンライン予約をします。
2. 必要なもの: 現在のパスポート、在留カード、申請書、手数料（写真は現地で撮影）。
3. 本人が窓口に行く必要があります。予約枠が埋まりやすいので早めに予約してください。
公式サイト: https://tokyo.philembassy.net/`,
    local: `Maaari kang mag-renew ng ePassport habang naninirahan sa Japan.
1. Mag-book online sa opisyal na website ng Philippine Embassy (Tokyo) o Consulate.
2. Kailangan: kasalukuyang pasaporte, residence card (zairyu), application form, at bayad (kukunan ng litrato sa mismong opisina).
3. Kailangang personal kang pumunta. Mabilis mapuno ang slots, kaya mag-book nang maaga.
Opisyal na website: https://tokyo.philembassy.net/`,
  },
  インドネシア: {
    nationality: "インドネシア",
    localLangLabel: "Bahasa Indonesia",
    officialName: "在日本インドネシア共和国大使館",
    officialUrl: "https://kbritokyo.id/",
    ja: `日本に住みながらパスポートを更新できます。
1. インドネシア大使館（東京）または総領事館のオンライン予約システム（M-Paspor / 予約サイト）から予約します。
2. 必要なもの: 現在のパスポート、在留カード、申請書、手数料。
3. 本人が窓口に行く必要があります。まず公式サイトで最新の予約方法を確認してください。
公式サイト: https://kbritokyo.id/`,
    local: `Anda dapat memperpanjang paspor sambil tinggal di Jepang.
1. Buat janji melalui sistem online (M-Paspor / situs reservasi) KBRI Tokyo atau Konsulat.
2. Yang diperlukan: paspor lama, kartu izin tinggal (zairyu), formulir, dan biaya.
3. Anda harus datang sendiri ke kantor. Silakan cek cara terbaru di situs resmi.
Situs resmi: https://kbritokyo.id/`,
  },
  ミャンマー: {
    nationality: "ミャンマー",
    localLangLabel: "မြန်မာဘာသာ",
    officialName: "在日本ミャンマー連邦共和国大使館",
    officialUrl: "https://www.myanmar-embassy-tokyo.net/",
    ja: `日本に住みながらパスポートを更新できます。
1. ミャンマー大使館（東京）の公式サイトで、更新（延長・新規発給）の方法と予約を確認します。
2. 必要なもの: 現在のパスポート、在留カード、証明写真、申請書、手数料。
3. 手続きが変わることがあるため、事前に大使館へ確認してください。
公式サイト: https://www.myanmar-embassy-tokyo.net/`,
    local: `ဂျပန်တွင်နေထိုင်ရင်း နိုင်ငံကူးလက်မှတ်ကို သက်တမ်းတိုးနိုင်ပါသည်။
1. တိုကျိုမြန်မာသံရုံး တရားဝင်ဝဘ်ဆိုက်တွင် သက်တမ်းတိုး/အသစ်ထုတ်နည်းနှင့် ချိန်းဆိုမှုကို စစ်ဆေးပါ။
2. လိုအပ်သည်များ- လက်ရှိနိုင်ငံကူးလက်မှတ်၊ နေထိုင်ခွင့်ကတ် (zairyu)၊ ဓာတ်ပုံ၊ လျှောက်လွှာနှင့် ကြေးငွေ။
3. လုပ်ထုံးလုပ်နည်း ပြောင်းလဲနိုင်သဖြင့် သံရုံးသို့ ကြိုတင်ဆက်သွယ်စစ်ဆေးပါ။
တရားဝင်ဝဘ်ဆိုက်- https://www.myanmar-embassy-tokyo.net/`,
  },
  ネパール: {
    nationality: "ネパール",
    localLangLabel: "नेपाली",
    officialName: "在日本ネパール大使館",
    officialUrl: "https://jp.nepalembassy.gov.np/",
    ja: `日本に住みながらパスポート（MRP/電子パスポート）を更新できます。
1. ネパール大使館（東京）の公式サイトでオンライン申請・予約を行います。
2. 必要なもの: 現在のパスポート、在留カード、申請書、手数料。
3. 本人が窓口に行く必要があります。最新の方法を公式サイトで確認してください。
公式サイト: https://jp.nepalembassy.gov.np/`,
    local: `तपाईं जापानमा बसेरै राहदानी नवीकरण गर्न सक्नुहुन्छ।
1. नेपाली राजदूतावास (टोकियो) को आधिकारिक वेबसाइटबाट अनलाइन आवेदन/समय आरक्षण गर्नुहोस्।
2. आवश्यक कागजात: हालको राहदानी, बसोबास कार्ड (zairyu), आवेदन फारम, र शुल्क।
3. आफैं कार्यालय जानुपर्छ। पछिल्लो प्रक्रिया वेबसाइटमा हेर्नुहोस्।
आधिकारिक वेबसाइट: https://jp.nepalembassy.gov.np/`,
  },
  タイ: {
    nationality: "タイ",
    localLangLabel: "ภาษาไทย",
    officialName: "在日本タイ王国大使館",
    officialUrl: "https://site.thaiembassy.jp/",
    ja: `日本に住みながら電子パスポートを更新できます。
1. タイ大使館（東京）または総領事館の公式サイトからオンライン予約をします。
2. 必要なもの: 現在のパスポート、在留カード、申請書、手数料。
3. 本人が窓口に行く必要があります。最新の予約方法を公式サイトで確認してください。
公式サイト: https://site.thaiembassy.jp/`,
    local: `คุณสามารถต่ออายุหนังสือเดินทางขณะอาศัยอยู่ในญี่ปุ่นได้
1. จองคิวออนไลน์ผ่านเว็บไซต์ทางการของสถานทูตไทย (โตเกียว) หรือสถานกงสุล
2. สิ่งที่ต้องเตรียม: หนังสือเดินทางเล่มปัจจุบัน, บัตรไซริว (zairyu), แบบฟอร์ม, และค่าธรรมเนียม
3. ต้องไปด้วยตนเอง กรุณาตรวจสอบวิธีล่าสุดบนเว็บไซต์ทางการ
เว็บไซต์ทางการ: https://site.thaiembassy.jp/`,
  },
  中国: {
    nationality: "中国",
    localLangLabel: "中文",
    officialName: "在日本中国大使館 / 総領事館",
    officialUrl: "http://www.china-embassy.or.jp/",
    ja: `日本に住みながらパスポートを更新できます。
1. 中国オンライン申請サイト（中国領事APP / 予約サイト）から申請・予約します。
2. 必要なもの: 現在のパスポート、在留カード、証明写真、申請書、手数料。
3. まず公式サイト・アプリで最新の方法を確認してください。
公式サイト: http://www.china-embassy.or.jp/`,
    local: `您可以在日本居住期间办理护照换发。
1. 通过"中国领事"App或预约网站进行在线申请和预约。
2. 需要材料：现有护照、在留卡（zairyu）、证件照、申请表、手续费。
3. 请先在官方网站或App上确认最新办理方式。
官方网站: http://www.china-embassy.or.jp/`,
  },
};

// 既定（該当国が未登録のとき）の汎用案内
export function defaultGuide(nationality: string): PassportGuide {
  const name = nationality || "ご出身国";
  return {
    nationality: name,
    localLangLabel: "English",
    officialName: `在日本${name}大使館・領事館`,
    officialUrl: "",
    ja: `日本に住みながらパスポートを更新できます。
1. ${name}の在日大使館・総領事館の公式サイトで、更新方法と予約を確認します。
2. 必要なもの: 現在のパスポート、在留カード、証明写真、申請書、手数料。
3. 手続きは国により異なります。まず大使館の公式サイトで最新情報を確認してください。`,
    local: `You can renew your passport while living in Japan.
1. Check the renewal procedure and make a reservation on the official website of your country's embassy/consulate in Japan.
2. What you need: current passport, residence card (zairyu), photo, application form, and fee.
3. Procedures vary by country. Please confirm the latest information on the embassy's official website.`,
  };
}

export function passportGuide(nationality: string): PassportGuide {
  const key = (nationality || "").trim();
  return GUIDES[key] ?? defaultGuide(key);
}

export function hasSpecificGuide(nationality: string): boolean {
  return (nationality || "").trim() in GUIDES;
}
