# 特定技能外国人 履歴書システム 総合改修 仕様書

対象システム
- 履歴書ツール（多言語Web履歴書 / GitHub Pages）: リポジトリ `akina12231988-star/tokutei-rireki` の `index.html`
- 外国人管理システム（本リポジトリ `immigration-app`）: PDF取り込み `/workers/import-pdf` と翻訳バックエンド `/api/translate`

既存のUI・PDFレイアウト・入力方法はできるだけ維持し、機能改善を中心に実装した。
履歴書PDFを共通データフォーマット（JSON）へ変換してから各システムへ取り込む設計とし、
履歴書以外の帳票にも再利用できる構成とした。

---

## 1. 修正内容一覧

| 項目 | 内容 | 対応箇所 |
|---|---|---|
| ① / ⑨項目名 | 「⑨ 学歴・職歴」→「⑨ 職歴」。学歴表記を入力画面・PDF双方から削除 | `tokutei-rireki/index.html`（`T[*].s2`, `buildResumeHTML`） |
| ② 各国語表示 | 職歴入力欄が入力言語に追従。言語切替時に既存の職歴・家族行も再翻訳（`relabelDynamicRows`） | `applyT` / `relabelDynamicRows` |
| ③ 在留資格プルダウン化 | 職歴「当時の在留資格」をテキスト→`<select>`へ | `addCareer` / `residenceOptionsHTML` |
| ④ 在留資格の選択肢 | 7区分を多言語プルダウン化。PDF出力時は必ず日本語へ変換 | `RESIDENCE` 辞書 / `residenceJa` |
| ⑤ PDF出力 | 入力→日本語化→履歴書生成→印刷画面→保存の一連が必ず完了するよう修正。例外・タイムアウトでもPDFを生成 | `translateAndShowPDF` / `translateFields` |
| ⑥ 翻訳処理 | ブラウザ直APIを廃止。選択式は辞書変換で確定、自由記述のみ安全なバックエンド `/api/translate` 経由（任意）。APIエラー・JSON解析・例外・タイムアウトを処理 | `translateFields` / `src/app/api/translate/route.ts` |
| ⑦ PDFレイアウト | 「⑨ 職歴」表記、右列「当時の在留資格」、学歴非表示 | `buildResumeHTML` |
| ⑧ GitHub Pages | `index.html` をルートに配置、`.nojekyll` 追加、旧ファイルはリダイレクト。単一HTML＋Fonts CDNのみで動作 | `tokutei-rireki` |
| ⑨ 表示モード切替 | スマホ／PC／自動の切替ボタン。`localStorage` で保持 | `.view-toggle` / `setView` |
| ⑩ PDFインポート | 管理システムで履歴書PDFの内容（基本情報・職歴等）を取り込み | `/workers/import-pdf`, `src/lib/import/*` |
| ⑪ PDFだけで登録 | PDFアップロードのみで自動入力。OCRではなくテキスト層優先。職歴は行数無制限で全件 | `extractPdfText` / `resumePayloadToWorker` |
| ⑫ 拡張設計 | `docType` で識別する共通インポート処理。雇用条件書・支援計画・評価調書などを追加可能 | `src/lib/import/index.ts`（`DOC_HANDLERS`） |
| ⑬ コード整理 | 翻訳辞書・在留資格辞書・入力項目・PDFテンプレート・言語設定を共通オブジェクト化 | `T` / `RESIDENCE` / 各関数 |
| ⑭ 動作確認 | 下記「6. 動作確認結果」参照 | — |
| ⑮ 最終成果物 | 本ドキュメント一式＋GitHub反映（コミット・プッシュ） | — |

---

## 2. 翻訳辞書一覧（UIおよび職歴入力）

UI文言は `tokutei-rireki/index.html` の定数 `T` に集約。対応言語は
日本語(ja)・インドネシア語(id)・ベトナム語(vi)・クメール語(km)・タガログ語(tl)・英語(en)。

職歴入力項目の各言語訳（要件②）:

| キー | ja | id | vi | km | tl | en |
|---|---|---|---|---|---|---|
| 開始年 `cfrom` | 開始年 | Tahun Mulai | Năm bắt đầu | ឆ្នាំចាប់ផ្តើម | Taon ng Simula | Start Year |
| 月 `cfromm` | 月 | Bulan | Tháng | ខែ | Buwan | Month |
| 終了年 `cto` | 終了年 | Tahun Selesai | Năm kết thúc | ឆ្នាំបញ្ចប់ | Taon ng Pagtatapos | End Year |
| 月 `ctom` | 月 | Bulan | Tháng | ខែ | Buwan | Month |
| 会社名 `ccomp` | 会社名 | Nama Perusahaan | Tên công ty | ឈ្មោះក្រុមហ៊ុន | Pangalan ng Kumpanya | Company Name |
| 当時の在留資格 `cstat` | 当時の在留資格 | Status Tinggal Saat Itu | Tư cách lưu trú khi đó | ស្ថានភាពស្នាក់នៅពេលនោះ | Status ng Paninirahan noon | Residence Status at the Time |

セクション見出し（抜粋）:

| キー | ja | en |
|---|---|---|
| `s2` | ⑨ 職歴 | ⑨ Work History |
| `s3` | ⑩ 資格・免許 | ⑩ Qualifications & Licenses |

その他の全項目（基本情報・体の状態・家族構成・モーダル文言等）も同一の `T` に定義済み。

---

## 3. 在留資格辞書一覧（要件④）

`tokutei-rireki/index.html` の定数 `RESIDENCE`（配列）。`key` は言語非依存の内部コード、
`ja` はPDF出力用の日本語（**PDFでは必ずこれを使用**）。プルダウンには選択言語のラベルを表示。

| key | ja（PDF） | en |
|---|---|---|
| `ginou_jisshu_1` | 技能実習1号で修了 | Completed Technical Intern Training (i) |
| `ginou_jisshu_2` | 技能実習2号で修了 | Completed Technical Intern Training (ii) |
| `ginou_jisshu_3` | 技能実習3号で修了 | Completed Technical Intern Training (iii) |
| `tokkatsu_corona` | 特定活動（コロナによる帰国困難） | Designated Activities (unable to return home due to COVID-19) |
| `tokkatsu_ikou` | 特定活動（特定技能1号移行準備） | Designated Activities (preparing to transfer to SSW (i)) |
| `tokutei_1` | 特定技能1号 | Specified Skilled Worker (i) |
| `tokutei_2` | 特定技能2号 | Specified Skilled Worker (ii) |

※ id / vi / km / tl の訳も同配列に定義済み。

### 3.1 職歴取り込み時の在留資格 → VisaType 対応

管理システム側 `src/lib/import/resume.ts` の `RESIDENCE_JA_TO_VISA`。職歴（work_histories）の
在留資格区分（`src/types/ssw.ts` の `VisaType`）へ写像する。

| 履歴書の日本語 | VisaType（管理システム） |
|---|---|
| 技能実習1号で修了 / 2号 / 3号 | 技能実習 |
| 特定活動（特定技能1号移行準備） | 特定活動（特定技能1号移行準備） |
| 特定活動（コロナによる帰国困難） | その他 |
| 特定技能1号 | 特定技能1号 |
| 特定技能2号 | 特定技能2号 |

---

## 4. PDFインポート仕様書（要件⑩⑪⑫）

### 4.1 埋め込み方式
履歴書ツールは生成する履歴書HTML/PDFの末尾に、**機械可読な共通データ（JSON）**を
不可視（白文字・極小フォント）のテキストとして埋め込む。OCRではなくPDFの
テキスト層を優先して読み取る。

```
@@RIREKI_JSON_V1@@<UTF-8 JSON を Base64 化した文字列>@@END@@
```

- Base64化: `btoa(unescape(encodeURIComponent(json)))`（UTF-8安全）
- PDFテキスト抽出はグリフ間に空白・改行を混入させるため、取り込み側は
  **テキスト全体から空白を除去**してからマーカーを探索し、分断を復元する
  （`src/lib/import/payload.ts` の `extractPayload`）。

### 4.2 取り込みフロー（管理システム）
1. `/workers/import-pdf` でPDFを選択（複数可）
2. `extractPdfText`（pdfjs-dist）でテキスト層を全ページ抽出
3. `extractPayload` で埋め込みJSONを取得
4. `parseDocumentText` が `docType` で分岐し、`resumePayloadToWorker` が
   外国人＋職歴レコードへ変換（職歴は**行数制限なしで全件**、空行は除外）
5. `importDocumentWorkers` が Supabase へ UPSERT（`legacy_id = pdf:氏名:生年月日` で
   再取込時も重複しない）

### 4.3 拡張性（要件⑫）
`src/lib/import/index.ts` の `DOC_HANDLERS`（`docType` → ハンドラのレジストリ）に
エントリを追加するだけで、履歴書以外の帳票に対応できる。

```ts
const DOC_HANDLERS = {
  resume: (payload) => { ... },
  // employment_conditions: (payload) => { ... },  // 雇用条件書
  // support_plan:          (payload) => { ... },  // 支援計画
  // skill_evaluation:      (payload) => { ... },  // 技能実習評価調書
};
```
各帳票ツール側で同じマーカー方式・`docType` を付けてJSONを埋め込めば、
共通のインポート経路で取り込める。

---

## 5. データ構造仕様書（共通フォーマット）

履歴書ペイロード（`docType: "resume"`, `version: 1`）。値はPDF生成時に日本語化済み。

```jsonc
{
  "docType": "resume",
  "schema": "tokutei-rireki",
  "version": 1,
  "generatedAt": "2026-07-15T00:00:00.000Z",
  "sourceLang": "vi",                    // 入力言語
  "basic": {
    "name": "DO VAN VINH",               // 氏名（ローマ字）
    "kana": "DO VAN VINH",               // フリガナ
    "gender": "男性",                     // 男性 / 女性
    "birth": "1995-03-01",               // 生年月日 YYYY-MM-DD
    "nationality": "ベトナム",
    "languages": "日本語・ベトナム語",
    "spouse": "無",                       // 有 / 無
    "trainingType": "農業",               // 実習の職種
    "trainingWork": "施設園芸",           // 実習の作業名
    "trainingEnd": "2022-03-31",
    "visaExpiry": "2027-04-01",
    "residenceStatus": "特定技能1号",     // 現在の在留資格（自由記述）
    "addressJapan": "…",
    "addressHome": "…",
    "qualifications": "専門級",
    "height": "170", "weight": "65", "bloodType": "A型",
    "illness": "なし", "vision": "1.0 / 1.0", "dominantHand": "右",
    "hobby": "サッカー", "drinking": "時々", "smoking": "無"
  },
  "careers": [                            // 職歴（行数無制限で全件）
    {
      "startYear": "2019", "startMonth": "4",
      "endYear": "2022",  "endMonth": "3",
      "company": "みどり農園",
      "residenceStatusKey": "ginou_jisshu_2",  // 内部コード
      "residenceStatus": "技能実習2号で修了"     // 日本語（PDF表記）
    }
  ],
  "families": [
    { "relation": "父", "name": "DO VAN A", "birthYear": "1965", "job": "農業" }
  ]
}
```

### 管理システムのマッピング（`resume.ts`）
| ペイロード | workers 列 |
|---|---|
| basic.name / kana / nationality / birth | name / kana / nationality / birth |
| basic.residenceStatus | residence_status |
| basic.visaExpiry | residence_expiry_date |
| basic.trainingType | field |
| basic.qualifications | other_qualifications |
| 身長・体重・血液型・視力・利き手・病気・飲酒・喫煙・趣味 | health_note（まとめて） |
| families[] | family_note（まとめて） |
| 性別・言語・配偶者・実習作業名・実習修了日・住所 | note（まとめて） |
| careers[] | work_histories[]（start_date=年月の1日、visa=在留資格の写像） |

---

## 6. 動作確認結果（要件⑭）

自動検証は Chromium（Playwright）＋ pdfjs＋ vitest で実施。
（検証スクリプト: セッション scratchpad の `verify.mjs` / `e2e.mjs`）

| 確認項目 | 結果 | 備考 |
|---|---|---|
| 日本語表示正常 | ✅ | 見出し「⑨ 職歴」 |
| ベトナム語表示正常 | ✅ | 「⑨ Kinh nghiệm làm việc」等 |
| インドネシア語表示正常 | ✅ | 「⑨ Riwayat Pekerjaan」等 |
| クメール語表示正常 | ✅ | 「⑨ បទពិសោធន៍ការងារ」等 |
| タガログ語表示正常 | ✅ | 「⑨ Karanasan sa Trabaho」等 |
| 英語表示正常 | ✅ | 「⑨ Work History」等 |
| 在留資格プルダウン正常 | ✅ | 7区分＋プレースホルダ、選択言語で表示 |
| 職歴入力の各国語表示（②） | ✅ | 言語切替で既存行も再翻訳 |
| PDF生成正常 | ✅ | A4 PDFを実生成（約0.5MB） |
| PDF保存正常 | ✅ | 印刷/共有→保存フロー（モーダル案内） |
| 日本語翻訳正常 | ✅ | 選択式は辞書で確定、PDF在留資格は日本語 |
| GitHub Pages構成 | ✅ | index.html＋.nojekyll をルートに配置しプッシュ済み（※公開URLの最終確認は運用者側で） |
| スマホ表示正常 | ✅ | `force-mobile` 適用 |
| PC表示正常 | ✅ | `force-pc` 適用 |
| PDFインポート正常 | ✅ | 実PDF→pdfjs抽出→JSON復元まで通し確認 |
| 職歴全件インポート | ✅ | 25件でも全件（unit test）、空行は除外 |
| コンソール/JSエラーなし | ✅ | JSエラーなし（Google Fontsのオフライン読込失敗のみ＝本番は解消） |
| 既存機能を壊していない | ✅ | 既存の旧JSON取込・履歴書発行・全43テストが緑 |
| 型チェック / Lint（管理システム） | ✅ | `tsc --noEmit` / `eslint` / `next build` 成功 |

### 補足・運用上の注意
- `/api/translate` は**有料APIの無認証公開プロキシ化を避けるため既定で無効**。
  運用者が `ENABLE_TRANSLATE_API=true` と `TRANSLATE_ALLOWED_ORIGINS`（許可オリジン）を
  設定して初めて有効になる（`.env.example` 参照）。未設定でも履歴書ツールは
  選択式は辞書変換、自由記述は入力言語のままPDFを生成し、フローは完了する。
- GitHub Pages は Settings → Pages で Source=`main /(root)` を選択する（本改修で
  404の原因だったindex.html不在を解消済み）。
