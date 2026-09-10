// 履歴書ツールの選択肢（在留資格・特定技能分野・技能実習の職種／作業）と内蔵の翻訳辞書。
// 元は tokutei-rireki/index.html の RESIDENCE / CURRENT_STATUS / SSW_FIELDS / JITSU_JOBS / DICT。
// key は言語に依存しない内部コード、ja は履歴書PDFに必ず出す日本語。各言語はプルダウン表示用。

import type { ResumeLang } from "./i18n";

export interface BilingualOption {
  key: string;
  ja: string;
  en: string;
  vi: string;
  id: string;
  km: string;
  tl: string;
}

// 職歴の「当時の在留資格」（技能実習の修了区分・特定活動・特定技能）
export const RESIDENCE: BilingualOption[] = [
  { key: "ginou_jisshu_1", ja: "技能実習1号で修了", en: "Completed Technical Intern Training (i)", vi: "Hoàn thành Thực tập kỹ năng số 1", id: "Selesai Magang Teknis Tingkat 1", km: "បញ្ចប់កម្មសិក្សាជំនាញលេខ ១", tl: "Natapos ang Technical Intern Training Blg. 1" },
  { key: "ginou_jisshu_2", ja: "技能実習2号で修了", en: "Completed Technical Intern Training (ii)", vi: "Hoàn thành Thực tập kỹ năng số 2", id: "Selesai Magang Teknis Tingkat 2", km: "បញ្ចប់កម្មសិក្សាជំនាញលេខ ២", tl: "Natapos ang Technical Intern Training Blg. 2" },
  { key: "ginou_jisshu_3", ja: "技能実習3号で修了", en: "Completed Technical Intern Training (iii)", vi: "Hoàn thành Thực tập kỹ năng số 3", id: "Selesai Magang Teknis Tingkat 3", km: "បញ្ចប់កម្មសិក្សាជំនាញលេខ ៣", tl: "Natapos ang Technical Intern Training Blg. 3" },
  { key: "tokkatsu_corona", ja: "特定活動（コロナによる帰国困難）", en: "Designated Activities (unable to return home due to COVID-19)", vi: "Hoạt động đặc định (khó về nước do COVID-19)", id: "Kegiatan Khusus (sulit pulang karena COVID-19)", km: "សកម្មភាពជាក់លាក់ (ពិបាកត្រឡប់មាតុភូមិដោយសារ COVID-19)", tl: "Natatanging Gawain (hirap makauwi dahil sa COVID-19)" },
  { key: "tokkatsu_ikou", ja: "特定活動（特定技能1号移行準備）", en: "Designated Activities (preparing to transfer to SSW (i))", vi: "Hoạt động đặc định (chuẩn bị chuyển sang Kỹ năng đặc định số 1)", id: "Kegiatan Khusus (persiapan transisi ke SSW Tingkat 1)", km: "សកម្មភាពជាក់លាក់ (រៀបចំផ្លាស់ប្តូរទៅជំនាញជាក់លាក់លេខ ១)", tl: "Natatanging Gawain (paghahanda sa paglipat sa SSW Blg. 1)" },
  { key: "tokutei_1", ja: "特定技能1号", en: "Specified Skilled Worker (i)", vi: "Kỹ năng đặc định số 1", id: "Pekerja Berketerampilan Khusus Tingkat 1", km: "ជំនាញជាក់លាក់លេខ ១", tl: "Espesyal na Bihasang Manggagawa Blg. 1" },
  { key: "tokutei_2", ja: "特定技能2号", en: "Specified Skilled Worker (ii)", vi: "Kỹ năng đặc định số 2", id: "Pekerja Berketerampilan Khusus Tingkat 2", km: "ជំនាញជាក់លាក់លេខ ២", tl: "Espesyal na Bihasang Manggagawa Blg. 2" },
];

// 現在の在留資格（法務省の在留資格）。特定技能1号へ移行しやすい順
export const CURRENT_STATUS: BilingualOption[] = [
  { key: "cur_tokutei_1", ja: "特定技能1号", en: "Specified Skilled Worker (i)", vi: "Kỹ năng đặc định số 1", id: "Pekerja Berketerampilan Khusus Tingkat 1", km: "ជំនាញជាក់លាក់លេខ ១", tl: "Espesyal na Bihasang Manggagawa Blg. 1" },
  { key: "cur_jisshu_2", ja: "技能実習2号", en: "Technical Intern Training (ii)", vi: "Thực tập kỹ năng số 2", id: "Magang Teknis Tingkat 2", km: "កម្មសិក្សាជំនាញលេខ ២", tl: "Technical Intern Training Blg. 2" },
  { key: "cur_jisshu_3", ja: "技能実習3号", en: "Technical Intern Training (iii)", vi: "Thực tập kỹ năng số 3", id: "Magang Teknis Tingkat 3", km: "កម្មសិក្សាជំនាញលេខ ៣", tl: "Technical Intern Training Blg. 3" },
  { key: "cur_tokkatsu_ikou", ja: "特定活動（特定技能1号移行準備）", en: "Designated Activities (preparing to transfer to SSW (i))", vi: "Hoạt động đặc định (chuẩn bị chuyển sang Kỹ năng đặc định số 1)", id: "Kegiatan Khusus (persiapan transisi ke SSW Tingkat 1)", km: "សកម្មភាពជាក់លាក់ (រៀបចំផ្លាស់ប្តូរទៅជំនាញជាក់លាក់លេខ ១)", tl: "Natatanging Gawain (paghahanda sa paglipat sa SSW Blg. 1)" },
  { key: "cur_tokkatsu_work", ja: "特定活動（就労可）", en: "Designated Activities (work permitted)", vi: "Hoạt động đặc định (được phép làm việc)", id: "Kegiatan Khusus (boleh bekerja)", km: "សកម្មភាពជាក់លាក់ (អនុញ្ញាតឱ្យធ្វើការ)", tl: "Natatanging Gawain (pinapayagang magtrabaho)" },
  { key: "cur_ryugaku", ja: "留学", en: "Student", vi: "Du học", id: "Pelajar (Ryugaku)", km: "និស្សិត", tl: "Estudyante (Ryugaku)" },
  { key: "cur_jisshu_1", ja: "技能実習1号", en: "Technical Intern Training (i)", vi: "Thực tập kỹ năng số 1", id: "Magang Teknis Tingkat 1", km: "កម្មសិក្សាជំនាញលេខ ១", tl: "Technical Intern Training Blg. 1" },
  { key: "cur_tokutei_2", ja: "特定技能2号", en: "Specified Skilled Worker (ii)", vi: "Kỹ năng đặc định số 2", id: "Pekerja Berketerampilan Khusus Tingkat 2", km: "ជំនាញជាក់លាក់លេខ ២", tl: "Espesyal na Bihasang Manggagawa Blg. 2" },
  { key: "cur_gijinkoku", ja: "技術・人文知識・国際業務", en: "Engineer / Specialist in Humanities / Intl Services", vi: "Kỹ thuật · Tri thức nhân văn · Nghiệp vụ quốc tế", id: "Insinyur / Humaniora / Layanan Internasional", km: "បច្ចេកទេស · មនុស្សសាស្ត្រ · សេវាកម្មអន្តរជាតិ", tl: "Engineer / Humanities / Intl Services" },
  { key: "cur_kazoku", ja: "家族滞在", en: "Dependent", vi: "Lưu trú gia đình (phụ thuộc)", id: "Tinggal Keluarga (Dependen)", km: "ការស្នាក់នៅជាមួយគ្រួសារ", tl: "Dependent (Pamilya)" },
  { key: "cur_tanki", ja: "短期滞在", en: "Temporary Visitor", vi: "Lưu trú ngắn hạn", id: "Kunjungan Sementara", km: "ការស្នាក់នៅរយៈពេលខ្លី", tl: "Panandaliang Pananatili" },
  { key: "cur_other", ja: "その他", en: "Other", vi: "Khác", id: "Lainnya", km: "ផ្សេងៗ", tl: "Iba pa" },
];

// 特定技能の産業分野（16分野）
export const SSW_FIELDS: BilingualOption[] = [
  { key: "kaigo", ja: "介護", en: "Nursing Care", vi: "Điều dưỡng", id: "Perawatan (Kaigo)", km: "ថែទាំ", tl: "Pangangalaga (Kaigo)" },
  { key: "bldg", ja: "ビルクリーニング", en: "Building Cleaning", vi: "Vệ sinh tòa nhà", id: "Pembersihan Gedung", km: "សម្អាតអគារ", tl: "Paglilinis ng Gusali" },
  { key: "kogyo", ja: "工業製品製造業", en: "Industrial Product Manufacturing", vi: "Sản xuất sản phẩm công nghiệp", id: "Manufaktur Produk Industri", km: "ផលិតផលិតផលឧស្សាហកម្ម", tl: "Pagmamanupaktura ng Produktong Pang-industriya" },
  { key: "kensetsu", ja: "建設", en: "Construction", vi: "Xây dựng", id: "Konstruksi", km: "សំណង់", tl: "Konstruksyon" },
  { key: "zosen", ja: "造船・舶用工業", en: "Shipbuilding & Ship Machinery", vi: "Đóng tàu · công nghiệp hàng hải", id: "Perkapalan & Mesin Kapal", km: "ការសាងសង់នាវា", tl: "Paggawa ng Barko at Makinarya" },
  { key: "seibi", ja: "自動車整備", en: "Automobile Maintenance", vi: "Bảo dưỡng ô tô", id: "Perawatan Mobil", km: "ថែទាំរថយន្ត", tl: "Pagmementina ng Sasakyan" },
  { key: "koku", ja: "航空", en: "Aviation", vi: "Hàng không", id: "Penerbangan", km: "អាកាសចរណ៍", tl: "Abyasyon" },
  { key: "shukuhaku", ja: "宿泊", en: "Accommodation", vi: "Lưu trú (khách sạn)", id: "Akomodasi (Perhotelan)", km: "ការស្នាក់នៅ (សណ្ឋាគារ)", tl: "Akomodasyon (Hotel)" },
  { key: "unso", ja: "自動車運送業", en: "Automobile Transportation", vi: "Vận tải ô tô", id: "Transportasi Mobil", km: "ដឹកជញ្ជូនរថយន្ត", tl: "Transportasyon ng Sasakyan" },
  { key: "tetsudo", ja: "鉄道", en: "Railway", vi: "Đường sắt", id: "Kereta Api", km: "ផ្លូវរថភ្លើង", tl: "Tren (Riles)" },
  { key: "nogyo", ja: "農業", en: "Agriculture", vi: "Nông nghiệp", id: "Pertanian", km: "កសិកម្ម", tl: "Agrikultura" },
  { key: "gyogyo", ja: "漁業", en: "Fishery", vi: "Ngư nghiệp", id: "Perikanan", km: "នេសាទ", tl: "Pangingisda" },
  { key: "inshoku_seizo", ja: "飲食料品製造業", en: "Food & Beverage Manufacturing", vi: "Sản xuất thực phẩm & đồ uống", id: "Manufaktur Makanan & Minuman", km: "ផលិតម្ហូបអាហារ និងភេសជ្ជៈ", tl: "Pagmamanupaktura ng Pagkain at Inumin" },
  { key: "gaishoku", ja: "外食業", en: "Food Service", vi: "Dịch vụ ăn uống", id: "Layanan Makanan (Restoran)", km: "សេវាម្ហូបអាហារ", tl: "Serbisyong Pagkain (Restaurant)" },
  { key: "ringyo", ja: "林業", en: "Forestry", vi: "Lâm nghiệp", id: "Kehutanan", km: "ព្រៃឈើ", tl: "Panggugubat" },
  { key: "mokuzai", ja: "木材産業", en: "Wood Industry", vi: "Công nghiệp gỗ", id: "Industri Kayu", km: "ឧស្សាហកម្មឈើ", tl: "Industriya ng Kahoy" },
];

export interface JitsuJob extends BilingualOption {
  works: BilingualOption[];
}

// 技能実習の職種（技能実習法施行規則 別表第二の主要職種）と、その作業
export const JITSU_JOBS: JitsuJob[] = [
  {
    key: "nogyo_kosyu", ja: "耕種農業", en: "Crop Farming", vi: "Trồng trọt", id: "Pertanian tanaman", km: "កសិកម្មដំណាំ", tl: "Pagsasaka ng Pananim",
    works: [
      { key: "nogyo_kosyu_0", ja: "施設園芸", en: "Facility horticulture", vi: "Trồng trọt nhà kính", id: "Hortikultura rumah kaca", km: "", tl: "" },
      { key: "nogyo_kosyu_1", ja: "畑作・野菜", en: "Field crops & vegetables", vi: "Trồng rau màu", id: "Tanaman ladang & sayur", km: "", tl: "" },
      { key: "nogyo_kosyu_2", ja: "果樹", en: "Fruit growing", vi: "Trồng cây ăn quả", id: "Budidaya buah", km: "", tl: "" },
    ],
  },
  {
    key: "chikusan", ja: "畜産農業", en: "Livestock Farming", vi: "Chăn nuôi", id: "Peternakan", km: "ចិញ្ចឹមសត្វ", tl: "Pag-aalaga ng Hayop",
    works: [
      { key: "chikusan_0", ja: "養豚", en: "Pig farming", vi: "Nuôi lợn", id: "Ternak babi", km: "", tl: "" },
      { key: "chikusan_1", ja: "養鶏", en: "Poultry farming", vi: "Nuôi gà", id: "Ternak ayam", km: "", tl: "" },
      { key: "chikusan_2", ja: "酪農", en: "Dairy farming", vi: "Nuôi bò sữa", id: "Peternakan sapi perah", km: "", tl: "" },
    ],
  },
  {
    key: "gyosen", ja: "漁船漁業", en: "Fishing Vessel", vi: "Đánh bắt cá", id: "Perikanan tangkap", km: "នេសាទនាវា", tl: "Pangingisda (Barko)",
    works: [
      { key: "gyosen_0", ja: "漁船漁業", en: "Fishing vessel operation", vi: "Đánh bắt trên tàu", id: "Operasi kapal ikan", km: "", tl: "" },
    ],
  },
  {
    key: "yoshoku", ja: "養殖業", en: "Aquaculture", vi: "Nuôi trồng thủy sản", id: "Budidaya perikanan", km: "ចិញ្ចឹមត្រី", tl: "Aquaculture",
    works: [
      { key: "yoshoku_0", ja: "ほたてがい・まがき養殖", en: "Scallop/oyster aquaculture", vi: "Nuôi sò/hàu", id: "Budidaya kerang/tiram", km: "", tl: "" },
    ],
  },
  {
    key: "daiku", ja: "建築大工", en: "Carpentry", vi: "Mộc xây dựng", id: "Pertukangan kayu", km: "ជាងឈើសំណង់", tl: "Karpinterya",
    works: [
      { key: "daiku_0", ja: "大工工事", en: "Carpentry work", vi: "Thi công mộc", id: "Pekerjaan tukang kayu", km: "", tl: "" },
    ],
  },
  {
    key: "katawaku", ja: "型枠施工", en: "Formwork", vi: "Ván khuôn", id: "Bekisting", km: "ការងារពុម្ព", tl: "Formwork",
    works: [
      { key: "katawaku_0", ja: "型枠工事", en: "Formwork", vi: "Thi công ván khuôn", id: "Pekerjaan bekisting", km: "", tl: "" },
    ],
  },
  {
    key: "tekkin", ja: "鉄筋施工", en: "Rebar Work", vi: "Cốt thép", id: "Besi beton", km: "ការងារដែក", tl: "Rebar",
    works: [
      { key: "tekkin_0", ja: "鉄筋組立て", en: "Rebar assembly", vi: "Lắp cốt thép", id: "Perakitan besi beton", km: "", tl: "" },
    ],
  },
  {
    key: "tobi", ja: "とび", en: "Scaffolding", vi: "Giàn giáo", id: "Perancah", km: "រនាំង", tl: "Scaffolding",
    works: [
      { key: "tobi_0", ja: "とび作業", en: "Scaffolding work", vi: "Công việc giàn giáo", id: "Pekerjaan perancah", km: "", tl: "" },
    ],
  },
  {
    key: "sakan", ja: "左官", en: "Plastering", vi: "Trát vữa", id: "Plesteran", km: "បូកបាយអ", tl: "Pagpapalitada",
    works: [
      { key: "sakan_0", ja: "左官作業", en: "Plastering work", vi: "Công việc trát vữa", id: "Pekerjaan plesteran", km: "", tl: "" },
    ],
  },
  {
    key: "naiso", ja: "内装仕上げ施工", en: "Interior Finishing", vi: "Hoàn thiện nội thất", id: "Finishing interior", km: "បញ្ចប់ការតុបតែងក្នុង", tl: "Interior Finishing",
    works: [
      { key: "naiso_0", ja: "プラスチック系床仕上げ工事", en: "Plastic floor finishing", vi: "Hoàn thiện sàn nhựa", id: "Finishing lantai plastik", km: "", tl: "" },
      { key: "naiso_1", ja: "ボード仕上げ工事", en: "Board finishing", vi: "Hoàn thiện tấm thạch cao", id: "Finishing papan", km: "", tl: "" },
      { key: "naiso_2", ja: "カーペット系床仕上げ工事", en: "Carpet floor finishing", vi: "Hoàn thiện sàn thảm", id: "Finishing lantai karpet", km: "", tl: "" },
    ],
  },
  {
    key: "kenki", ja: "建設機械施工", en: "Construction Machinery", vi: "Máy xây dựng", id: "Alat berat konstruksi", km: "គ្រឿងចក្រសំណង់", tl: "Makinarya sa Konstruksyon",
    works: [
      { key: "kenki_0", ja: "押土・整地", en: "Earth moving/leveling", vi: "San lấp mặt bằng", id: "Perataan tanah", km: "", tl: "" },
      { key: "kenki_1", ja: "積込み", en: "Loading", vi: "Bốc xếp", id: "Pemuatan", km: "", tl: "" },
      { key: "kenki_2", ja: "掘削", en: "Excavation", vi: "Đào đất", id: "Penggalian", km: "", tl: "" },
      { key: "kenki_3", ja: "締固め", en: "Compaction", vi: "Đầm nén", id: "Pemadatan", km: "", tl: "" },
    ],
  },
  {
    key: "sozai", ja: "そう菜製造業", en: "Prepared Foods Mfg", vi: "Chế biến món ăn sẵn", id: "Produksi lauk siap saji", km: "ផលិតម្ហូបសម្រេច", tl: "Handa nang Pagkain",
    works: [
      { key: "sozai_0", ja: "そう菜加工", en: "Prepared foods processing", vi: "Chế biến món ăn sẵn", id: "Pengolahan lauk siap saji", km: "", tl: "" },
    ],
  },
  {
    key: "pan", ja: "パン製造", en: "Bread Making", vi: "Làm bánh mì", id: "Pembuatan roti", km: "ធ្វើនំបុ័ង", tl: "Paggawa ng Tinapay",
    works: [
      { key: "pan_0", ja: "パン製造", en: "Bread making", vi: "Làm bánh mì", id: "Pembuatan roti", km: "", tl: "" },
    ],
  },
  {
    key: "shokuniku", ja: "牛豚食肉処理加工業", en: "Meat Processing", vi: "Chế biến thịt", id: "Pengolahan daging", km: "កែច្នៃសាច់", tl: "Pagpoproseso ng Karne",
    works: [
      { key: "shokuniku_0", ja: "牛豚部分肉製造", en: "Beef/pork cut meat mfg", vi: "Pha lóc thịt bò/lợn", id: "Produksi potongan daging", km: "", tl: "" },
    ],
  },
  {
    key: "fujinfuku", ja: "婦人子供服製造", en: "Apparel Sewing", vi: "May quần áo", id: "Menjahit pakaian", km: "ដេរសម្លៀកបំពាក់", tl: "Pananahi ng Damit",
    works: [
      { key: "fujinfuku_0", ja: "婦人子供既製服縫製", en: "Women's/children's apparel sewing", vi: "May quần áo nữ/trẻ em", id: "Menjahit pakaian wanita/anak", km: "", tl: "" },
    ],
  },
  {
    key: "kikai", ja: "機械加工", en: "Machining", vi: "Gia công cơ khí", id: "Permesinan", km: "ម៉ាស៊ីនកិន", tl: "Machining",
    works: [
      { key: "kikai_0", ja: "普通旋盤", en: "Engine lathe", vi: "Tiện thường", id: "Bubut biasa", km: "", tl: "" },
      { key: "kikai_1", ja: "フライス盤", en: "Milling machine", vi: "Phay", id: "Frais", km: "", tl: "" },
      { key: "kikai_2", ja: "数値制御旋盤", en: "CNC lathe", vi: "Tiện CNC", id: "Bubut CNC", km: "", tl: "" },
      { key: "kikai_3", ja: "マシニングセンタ", en: "Machining center", vi: "Trung tâm gia công", id: "Machining center", km: "", tl: "" },
    ],
  },
  {
    key: "yosetsu", ja: "溶接", en: "Welding", vi: "Hàn", id: "Pengelasan", km: "ការផ្សារ", tl: "Paghihinang",
    works: [
      { key: "yosetsu_0", ja: "手溶接", en: "Manual welding", vi: "Hàn tay", id: "Las manual", km: "", tl: "" },
      { key: "yosetsu_1", ja: "半自動溶接", en: "Semi-automatic welding", vi: "Hàn bán tự động", id: "Las semi-otomatis", km: "", tl: "" },
    ],
  },
  {
    key: "tosou", ja: "塗装", en: "Painting", vi: "Sơn", id: "Pengecatan", km: "ការលាបថ្នាំ", tl: "Pagpipintura",
    works: [
      { key: "tosou_0", ja: "建築塗装", en: "Architectural painting", vi: "Sơn xây dựng", id: "Pengecatan bangunan", km: "", tl: "" },
      { key: "tosou_1", ja: "金属塗装", en: "Metal painting", vi: "Sơn kim loại", id: "Pengecatan logam", km: "", tl: "" },
      { key: "tosou_2", ja: "噴霧塗装", en: "Spray painting", vi: "Sơn phun", id: "Pengecatan semprot", km: "", tl: "" },
    ],
  },
  {
    key: "plastic", ja: "プラスチック成形", en: "Plastic Molding", vi: "Ép nhựa", id: "Cetak plastik", km: "ចាក់ផ្សិតប្លាស្ទិក", tl: "Plastic Molding",
    works: [
      { key: "plastic_0", ja: "圧縮成形", en: "Compression molding", vi: "Ép nén", id: "Cetak kompresi", km: "", tl: "" },
      { key: "plastic_1", ja: "射出成形", en: "Injection molding", vi: "Ép phun", id: "Cetak injeksi", km: "", tl: "" },
      { key: "plastic_2", ja: "ブロー成形", en: "Blow molding", vi: "Thổi khuôn", id: "Cetak tiup", km: "", tl: "" },
    ],
  },
  {
    key: "kaigo", ja: "介護", en: "Nursing Care", vi: "Điều dưỡng", id: "Perawatan", km: "ថែទាំ", tl: "Pangangalaga",
    works: [
      { key: "kaigo_0", ja: "介護", en: "Nursing care", vi: "Điều dưỡng", id: "Perawatan", km: "", tl: "" },
    ],
  },
  {
    key: "bldg", ja: "ビルクリーニング", en: "Building Cleaning", vi: "Vệ sinh tòa nhà", id: "Pembersihan gedung", km: "សម្អាតអគារ", tl: "Paglilinis ng Gusali",
    works: [
      { key: "bldg_0", ja: "ビルクリーニング", en: "Building cleaning", vi: "Vệ sinh tòa nhà", id: "Pembersihan gedung", km: "", tl: "" },
    ],
  },
  {
    key: "seibi", ja: "自動車整備", en: "Auto Maintenance", vi: "Bảo dưỡng ô tô", id: "Perawatan mobil", km: "ថែទាំរថយន្ត", tl: "Pagmementina ng Sasakyan",
    works: [
      { key: "seibi_0", ja: "自動車整備", en: "Automobile maintenance", vi: "Bảo dưỡng ô tô", id: "Perawatan mobil", km: "", tl: "" },
    ],
  },
];

// 家族構成の続柄（選択式。履歴書には必ず日本語で出す）
export const RELATIONS: BilingualOption[] = [
  { key: "father", ja: "父", en: "Father", vi: "Cha (Bố)", id: "Ayah", km: "ឪពុក", tl: "Ama" },
  { key: "mother", ja: "母", en: "Mother", vi: "Mẹ", id: "Ibu", km: "ម្តាយ", tl: "Ina" },
  { key: "husband", ja: "夫", en: "Husband", vi: "Chồng", id: "Suami", km: "ប្តី", tl: "Asawa (lalaki)" },
  { key: "wife", ja: "妻", en: "Wife", vi: "Vợ", id: "Istri", km: "ប្រពន្ធ", tl: "Asawa (babae)" },
  { key: "son", ja: "息子", en: "Son", vi: "Con trai", id: "Anak laki-laki", km: "កូនប្រុស", tl: "Anak na lalaki" },
  { key: "daughter", ja: "娘", en: "Daughter", vi: "Con gái", id: "Anak perempuan", km: "កូនស្រី", tl: "Anak na babae" },
  { key: "elder_brother", ja: "兄", en: "Older brother", vi: "Anh trai", id: "Kakak laki-laki", km: "បងប្រុស", tl: "Kuya" },
  { key: "younger_brother", ja: "弟", en: "Younger brother", vi: "Em trai", id: "Adik laki-laki", km: "ប្អូនប្រុស", tl: "Nakababatang kapatid na lalaki" },
  { key: "elder_sister", ja: "姉", en: "Older sister", vi: "Chị gái", id: "Kakak perempuan", km: "បងស្រី", tl: "Ate" },
  { key: "younger_sister", ja: "妹", en: "Younger sister", vi: "Em gái", id: "Adik perempuan", km: "ប្អូនស្រី", tl: "Nakababatang kapatid na babae" },
  { key: "grandfather", ja: "祖父", en: "Grandfather", vi: "Ông", id: "Kakek", km: "ជីតា", tl: "Lolo" },
  { key: "grandmother", ja: "祖母", en: "Grandmother", vi: "Bà", id: "Nenek", km: "ជីដូន", tl: "Lola" },
];

// 「その他」の表示
export const OTHER_LABEL: Record<ResumeLang, string> = {ja: "その他", en: "Other", vi: "Khác", id: "Lainnya", km: "ផ្សេងៗ", tl: "Iba pa"};

// 翻訳サーバーを使わずに確実に日本語化できる決まった語（国籍・言語・続柄・病気・職種など）。
// キーは小文字・空白1つに正規化した形
export const RESUME_DICT: Record<string, string> = {
  "việt nam": "ベトナム",
  "viet nam": "ベトナム",
  "vietnam": "ベトナム",
  "nước việt nam": "ベトナム",
  "indonesia": "インドネシア",
  "campuchia": "カンボジア",
  "cambodia": "カンボジア",
  "kampuchea": "カンボジア",
  "philippines": "フィリピン",
  "pilipinas": "フィリピン",
  "myanmar": "ミャンマー",
  "miến điện": "ミャンマー",
  "thái lan": "タイ",
  "thailand": "タイ",
  "trung quốc": "中国",
  "china": "中国",
  "nepal": "ネパール",
  "mông cổ": "モンゴル",
  "mongolia": "モンゴル",
  "tiếng việt": "ベトナム語",
  "tiếng việt nam": "ベトナム語",
  "vietnamese": "ベトナム語",
  "bahasa vietnam": "ベトナム語",
  "tiếng nhật": "日本語",
  "tiếng nhật bản": "日本語",
  "japanese": "日本語",
  "nihongo": "日本語",
  "bahasa jepang": "日本語",
  "日本语": "日本語",
  "tiếng anh": "英語",
  "english": "英語",
  "bahasa inggris": "英語",
  "bahasa indonesia": "インドネシア語",
  "indonesian": "インドネシア語",
  "tiếng indonesia": "インドネシア語",
  "tiếng khmer": "クメール語",
  "khmer": "クメール語",
  "tagalog": "タガログ語",
  "filipino": "タガログ語",
  "tiếng trung": "中国語",
  "chinese": "中国語",
  "không": "無",
  "không có": "無",
  "khong": "無",
  "tidak": "無",
  "tidak ada": "無",
  "wala": "無",
  "none": "無",
  "no": "無",
  "គ្មាន": "無",
  "khỏe mạnh": "無",
  "có": "有",
  "co": "有",
  "ada": "有",
  "oo": "有",
  "yes": "有",
  "មាន": "有",
  "vợ": "妻",
  "chồng": "夫",
  "cha": "父",
  "bố": "父",
  "ba": "父",
  "ayah": "父",
  "father": "父",
  "ama": "父",
  "mẹ": "母",
  "má": "母",
  "ibu": "母",
  "mother": "母",
  "ina": "母",
  "con trai": "息子",
  "anak laki-laki": "息子",
  "son": "息子",
  "anak lalaki": "息子",
  "con gái": "娘",
  "anak perempuan": "娘",
  "daughter": "娘",
  "anak babae": "娘",
  "anh trai": "兄",
  "anh": "兄",
  "older brother": "兄",
  "kakak laki-laki": "兄",
  "kuya": "兄",
  "em trai": "弟",
  "younger brother": "弟",
  "adik laki-laki": "弟",
  "chị gái": "姉",
  "chị": "姉",
  "older sister": "姉",
  "kakak perempuan": "姉",
  "ate": "姉",
  "em gái": "妹",
  "younger sister": "妹",
  "adik perempuan": "妹",
  "ông": "祖父",
  "bà": "祖母",
  "kakek": "祖父",
  "grandfather": "祖父",
  "lolo": "祖父",
  "nenek": "祖母",
  "grandmother": "祖母",
  "lola": "祖母",
  "husband": "夫",
  "suami": "夫",
  "wife": "妻",
  "istri": "妻",
  "asawa": "配偶者",
  "kakak": "兄・姉",
  "adik": "弟・妹",
  "anak": "子",
  "brother": "兄弟",
  "sister": "姉妹",
  "kapatid": "兄弟姉妹",
  "saudara": "兄弟姉妹",
  "nông nghiệp": "農業",
  "pertanian": "農業",
  "agriculture": "農業",
  "farming": "農業",
  "agrikultura": "農業",
  "văn phòng": "事務",
  "office": "事務",
  "kantor": "事務",
  "opisina": "事務",
  "nhân viên văn phòng": "事務員",
  "công nhân": "労働者",
  "worker": "労働者",
  "buruh": "労働者",
  "manggagawa": "労働者",
  "nội trợ": "主婦",
  "housewife": "主婦",
  "ibu rumah tangga": "主婦",
  "xây dựng": "建設",
  "construction": "建設",
  "konstruksi": "建設",
  "chế biến thực phẩm": "食品加工",
  "food processing": "食品加工",
  "điều dưỡng": "介護",
  "chăm sóc": "介護",
  "care": "介護",
  "nursing": "介護",
  "caregiver": "介護",
  "介護士": "介護",
  "lái xe": "運転手",
  "driver": "運転手",
  "sopir": "運転手",
  "sinh viên": "学生",
  "student": "学生",
  "pelajar": "学生",
  "estudyante": "学生",
  "học sinh": "学生",
  "giáo viên": "教師",
  "teacher": "教師",
  "guru": "教師",
  "kinh doanh": "自営業",
  "business": "自営業",
  "buôn bán": "自営業",
  "nghỉ hưu": "退職",
  "retired": "退職",
  "pensiunan": "退職",
  "hàn": "溶接",
  "welding": "溶接",
  "welder": "溶接工",
  "tukang las": "溶接工",
  "thợ hàn": "溶接工",
  "masih sekolah": "学生",
  "sekolah": "学生",
  "mahasiswa": "学生",
  "siswa": "学生",
  "petani": "農業",
  "nelayan": "漁業",
  "pedagang": "自営業",
  "wiraswasta": "自営業",
  "karyawan": "会社員",
  "karyawan swasta": "会社員",
  "pegawai": "会社員",
  "staff": "会社員",
  "employee": "会社員",
  "nhân viên": "会社員",
  "công nhân viên": "会社員",
  "pns": "公務員",
  "pegawai negeri": "公務員",
  "công chức": "公務員",
  "perawat": "看護師",
  "nurse": "看護師",
  "y tá": "看護師",
  "tidak bekerja": "無職",
  "unemployed": "無職",
  "không làm việc": "無職",
  "thất nghiệp": "無職",
  "meninggal": "死去",
  "almarhum": "死去",
  "almarhumah": "死去",
  "deceased": "死去",
  "đã mất": "死去",
  "sơn": "塗装",
  "painting": "塗装",
  "mộc": "木工",
  "tiện": "旋盤加工",
  "phay": "フライス加工",
  "đúc": "鋳造",
  "may": "縫製",
  "sewing": "縫製",
  "cơ khí": "機械",
};

// 「十分に理解できる言語」だけに使う辞書（国名と同じ綴りでも「〜語」にする）
export const LANGUAGE_DICT: Record<string, string> = {
  "indonesia": "インドネシア語",
  "jepang": "日本語",
  "nhật": "日本語",
  "nhật bản": "日本語",
  "japan": "日本語",
  "日本": "日本語",
  "inggris": "英語",
  "anh": "英語",
  "ingles": "英語",
  "việt": "ベトナム語",
  "việt nam": "ベトナム語",
  "viet nam": "ベトナム語",
  "vietnam": "ベトナム語",
  "khmer": "クメール語",
  "kamboja": "クメール語",
  "cambodia": "クメール語",
  "campuchia": "クメール語",
  "ខ្មែរ": "クメール語",
  "tagalog": "タガログ語",
  "filipino": "タガログ語",
  "philippines": "タガログ語",
  "pilipinas": "タガログ語",
  "china": "中国語",
  "trung quốc": "中国語",
  "mandarin": "中国語",
  "korea": "韓国語",
  "korean": "韓国語",
  "hàn quốc": "韓国語",
  "thailand": "タイ語",
  "thái lan": "タイ語",
  "thai": "タイ語",
  "myanmar": "ミャンマー語",
  "burmese": "ミャンマー語",
  "nepal": "ネパール語",
  "nepali": "ネパール語",
};

// 翻訳の対象になる自由記述の項目（選択式の項目は日本語コードで確定しているので対象外）
export const FREE_TEXT_KEYS = ["nat","lang","jtype","jwork","adjp","adhm","lic","ill","hob"] as const;
