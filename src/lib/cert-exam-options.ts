// 日本語の合格証・専門外の合格証の「受験した試験名」「受験地」の候補。
// Notionの選択肢（外国人詳細）を移行したもの。候補に無い試験名・国名は自由入力できる。

export const NIHONGO_EXAM_NAME_OPTIONS = [
  "日本語能力試験　JLPT",
  "日本語能力試験　JEES",
  "受験してない",
  "Nursing care skills evaluation test(Vietnamese)",
  "Nursing care Japanese language evaluation test (Vietnamese)",
  "General crop farming (Vietnamese)",
  "General livestock farming (Vietnamese)",
  "国際交流基金日本語基礎テスト",
  "公益財団法人　日本国際教育支援協会",
  "技能実習の専門級の合格なので省略",
] as const;

// 専門外（技能水準）の試験名は、在留申請オンラインシステムの
// 「技能水準　合格した試験名」のプルダウンと同じ表記・同じ並びにしてある
// （画面で同じものを選べばよいだけにするため。英語の号数の表記ゆれも画面のまま）。
// 自由入力はしない。候補に無い値が登録済みの人は、その値も選択肢に残して表示する
export const SENMONGAI_EXAM_NAME_OPTIONS = [
  "試験免除 Test exemption",
  "介護技能評価試験 Nursing care skills evaluation test",
  "ビルクリーニング分野特定技能１号評価試験 Building cleaning field specified skills (i) evaluation test",
  "ビルクリーニング分野特定技能２号評価試験 Building cleaning field specified skills (i) evaluation test",
  "製造分野特定技能１号評価試験（機械金属加工） Manufacturing field skills (i) evaluation test(Machining & metal processing)",
  "製造分野特定技能２号評価試験（機械金属加工） Manufacturing field skills (ii) evaluation test(Machining & metal processing)",
  "製造分野特定技能１号評価試験（電気電子機器組立て） Manufacturing skills (i) test(Elec. & electronic equipment assembly)",
  "製造分野特定技能２号評価試験（電気電子機器組立て） Manufacturing skills (ii) test(Elec. & electronic equipment assembly)",
  "製造分野特定技能１号評価試験（金属表面処理） Manufacturing field skills (i) evaluation test(Metal surface treatment)",
  "製造分野特定技能２号評価試験（金属表面処理） Manufacturing field skills (ii) evaluation test(Metal surface treatment)",
  "建設分野特定技能１号評価試験（土木） Construction field specified skills (i) evaluation test(Civil engineering)",
  "建設分野特定技能２号評価試験（土木） Construction field specified skills (ii) evaluation test(Civil engineering)",
  "建設分野特定技能１号評価試験（建築） Construction field specified skills (i) evaluation test(Building)",
  "建設分野特定技能２号評価試験（建築） Construction field specified skills (ii) evaluation test(Building)",
  "建設分野特定技能１号評価試験（ライフライン・設備） Construction field skills (i) test(Infrastructure facilities & equipment)",
  "建設分野特定技能２号評価試験（ライフライン・設備） Construction field skills (ii) test(Infrastructure facilities & equipment)",
  "造船・舶用工業分野特定技能１号試験（溶接） Shipbuilding/ship machinery field skills (i) evaluation test(Welding)",
  "造船・舶用工業分野特定技能２号試験（溶接） Shipbuilding/ship machinery field skills (ii) evaluation test(Welding)",
  "造船・舶用工業分野特定技能１号試験（塗装） Shipbuilding/ship machinery field skills (i) evaluation test(Plastering)",
  "造船・舶用工業分野特定技能２号試験（塗装） Shipbuilding/ship machinery field skills (ii) evaluation test(Plastering)",
  "造船・舶用工業分野特定技能１号試験（鉄工） Shipbuilding/ship machinery field skills (i) evaluation test(Iron work)",
  "造船・舶用工業分野特定技能２号試験（鉄工） Shipbuilding/ship machinery field skills (ii) evaluation test(Iron work)",
  "造船・舶用工業分野特定技能１号試験（仕上げ） Shipbuilding/ship machinery field skills (i) evaluation test(Finishing)",
  "造船・舶用工業分野特定技能２号試験（仕上げ） Shipbuilding/ship machinery field skills (ii) evaluation test(Finishing)",
  "造船・舶用工業分野特定技能１号試験（機械加工） Shipbuilding/ship machinery field skills (i) evaluation test(Machining)",
  "造船・舶用工業分野特定技能２号試験（機械加工） Shipbuilding/ship machinery field skills (ii) evaluation test(Machining)",
  "造船・舶用工業分野特定技能１号試験（電気機器組立て） Shipbuilding/ship machinery skills1 test(Electrical equipment assembling)",
  "造船・舶用工業分野特定技能２号試験（電気機器組立て） Shipbuilding/ship machinery skills2 test(Electrical equipment assembling)",
  "自動車整備分野特定技能１号評価試験 Automobile repair and maintenance field specified skills(i) evaluation test",
  "自動車整備分野特定技能２号評価試験 Automobile repair and maintenance field specified skills(ii) evaluation test",
  "航空分野特定技能１号評価試験（空港グランドハンドリング） Aviation field skills(i) evaluation test (airport ground handling)",
  "航空分野特定技能２号評価試験（空港グランドハンドリング） Aviation field skills(ii) evaluation test (airport ground handling)",
  "航空分野特定技能１号評価試験（航空機整備） Aviation field specified skills(i) evaluation test (aircraft maintenance)",
  "航空分野特定技能２号評価試験（航空機整備） Aviation field specified skills(ii) evaluation test (aircraft maintenance)",
  "宿泊分野特定技能１号評価試験 Accommodation industry specified skills(i) proficiency test",
  "宿泊分野特定技能２号評価試験 Accommodation industry specified skills(ii) proficiency test",
  "１号農業技能測定試験（耕種農業全般） Agriculture specified skills(i) proficiency test (cultivation agriculture)",
  "２号農業技能測定試験（耕種農業全般） Agriculture specified skills(ii) proficiency test (cultivation agriculture)",
  "１号農業技能測定試験（畜産農業全般） Agriculture specified skills(i) proficiency test (livestock agriculture)",
  "２号農業技能測定試験（畜産農業全般） Agriculture specified skills(ii) proficiency test (livestock agriculture)",
  "１号漁業技能測定試験（漁業） Fishing industry specified skills(i) proficiency test (fishery)",
  "２号漁業技能測定試験（漁業） Fishing industry specified skills(ii) proficiency test (fishery)",
  "１号漁業技能測定試験（養殖業） Fishing industry specified skills(i) proficiency test (aquaculture industry)",
  "２号漁業技能測定試験（養殖業） Fishing industry specified skills(ii) proficiency test (aquaculture industry)",
  "飲食料品製造業特定技能１号技能測定試験 Food and beverage manufacturing industry specified skills (i) proficiency test",
  "飲食料品製造業特定技能２号技能測定試験 Food and beverage manufacturing industry specified skills (ii) proficiency test",
  "外食業特定技能１号技能測定試験 Restaurant industry specified skills (i) proficiency test",
  "外食業特定技能２号技能測定試験 Restaurant industry specified skills (ii) proficiency test",
] as const;

// 受験地: 日本国内 / それ以外（海外の国名を自由入力）
export const EXAM_LOCATION_JAPAN = "日本国内";
