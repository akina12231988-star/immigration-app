# 開発ハンドオフ資料

最終更新: 2026-07-17

次回開発を引き継ぐための現状整理。デバッグ経緯や試行錯誤は省き、「今どうなっているか」「これから何をするか」に絞る。

---

## 1. プロジェクト概要

**登録支援機関 VUONG VAN THANH** の業務管理システム。特定技能（1号）外国人の在留・申請・生活支援業務を一元管理する社内向けWebアプリ。

- **用途**: 外国人名簿管理、入管申請管理、在留期限/パスポート更新アラート、生活オリエンテーション記録、求人/求職管理、課税・納税証明書の郵送請求判定、A4印刷（社内用/会社提出用）
- **利用形態**: PC + スマホ両対応（レスポンシブ）。スマホはホーム画面追加（PWA）に対応済み
- **言語**: 日本語UI（一部ベトナム語等の案内文あり）

### 技術スタック

| 分類 | 採用 |
|------|------|
| フレームワーク | Next.js 16（App Router）/ React 19 / TypeScript |
| スタイル | Tailwind CSS 4 |
| バックエンド | Supabase（Postgres + Auth + Storage、RLS運用） |
| アイコン | lucide-react |
| QR/印刷 | qrcode、styled-jsx（動的 `@page`） |
| 画像処理 | sharp（アイコン生成。ビルド依存ではなく開発時のみ利用） |
| テスト | Vitest |
| ホスティング | Vercel（Hobby） |

### コマンド

```
npm run dev     # 開発サーバ
npm run build   # 本番ビルド（型チェック兼用）
npm run lint    # ESLint
npm run test    # Vitest
```

**コミット前に必ず `npm run lint && npm run build && npm run test` を通すこと。**

---

## 2. 現在完成している機能

### 認証・基盤
- Supabase Auth ログイン（`/login`）、`my_role()` によるRLS運用
- レスポンシブ基盤: PCサイドナビ（`SideNav`）+ スマホ下部タブ（`BottomNav`）、共通ナビ定義 `src/lib/nav-items.ts`
- ダークモード（システム設定連動、初期表示ちらつき防止スクリプトを `layout.tsx` に内蔵）
- **PWA / ホーム画面追加**: `src/app/manifest.ts` + 実ロゴから生成したアイコン（`public/icon-192/512`, `apple-touch-icon`, `icon-maskable-512`）

### ダッシュボード（`/`）
- 集計カード（クリックで絞り込み一覧へ）
  - カード名: **LINE未報告件数 / 現在審査中件数 / 在留カード受取待ち件数** ほか
- ホームに求人カードへの導線

### 外国人管理（`/workers`）
- 一覧（検索・絞り込み）、新規登録、詳細、編集
- **サマリーカードのクリック絞り込み**（6種: 在籍中 / 1号5年以内で残り1年以内 / 在留期限3ヶ月以内 / 退職者 など）+ 在留期限の対象期間フィルタ
- 登録項目: 顔写真、氏名/フリガナ、国籍、生年月日、性別、在留資格・在留カード番号・在留許可日・在留期限、パスポート番号/有効期限、Notionリンク、Messengerリンク、雇用開始年月日、配属先営業所、居住先、退職日、外国人ID
- **外国人ID（`worker_code`）**: 形式「大文字英字1文字（国籍）-数字」を自動採番（`src/lib/worker-code.ts`）
- **申請書類用の通算パネル**（詳細ページ）: 書類作成日を入力すると、最初の特定技能1号/特定活動（通算対象）期間の起算日から書類作成日までを「〇年〇ヶ月」で表示（端数月は切り上げ）。「職歴と申請書記載をコピー」ボタン
- 在籍履歴（work_histories）
- **取込**（`/workers/import`）: Notion JSON + Notion CSV に対応。会社名で所属機関を解決（空白正規化でマージ）

### 入管申請管理（`/applications`）
- 申請登録（`/applications/new`）、一覧、詳細、編集、取下げ、削除
- **絞り込みタブ**: すべて / LINE未報告 / 審査中 / 在留カード受け取り待ち
- 「受け取り可能！」バッジ（受取予定日を過ぎたら表示）
- 申請フロー: 画像保存、許可報告（LINE）、在留カード、窓口/オンライン区分
- 在留資格に **「特定技能1号更新」** あり（生活オリエンテーション自動登録の対象外）
- 氏名入力（候補コンボボックス）で紐づく外国人の在留期限を自動表示。新規外国人は在留期限を手入力

### 在留更新対象（`/workers/renewals`）
- 在留期限の3ヶ月前で対象化。**退職者・審査中（申請中の外国人）は対象外**
- 名簿カード（`WorkerRenewalCard`、外国人管理の「在留期限3ヶ月以内」と同一表示を共有）
  - 氏名はクリック不可 + コピー可、別途「外国人情報」ボタン、現在の在留資格を表示
  - todo番号入力で「準備中」等の状態遷移、対応状況に **「審査中」** あり
  - Messenger/Notionリンクは未登録時のみその場で入力可

### パスポート更新必要（`/workers/passports`）
- パスポート有効期限の半年前で対象化
- 国籍別の更新手続き案内（日本語 + 現地言語、`src/lib/passport-guides.ts`）

### 生活オリエンテーション（`/orientations`）
- 一覧、リンク方式の記録
- **実施予定日超過アラート/タブ**「要実施（予定日超過）」
- 新規登録（氏名・所属機関をコンボボックス、「+新規登録」リンク、実施済選択時に実施日入力）

### 郵送請求（`/mailing`）— 課税・納税証明書 取得タイミング判定ツール
- 3タブ構成（判定 / 自治体マスタ / 判定記録）
- 判定ロジック: `src/lib/tax-cert.ts`（judgeYear / judgeTiming / judgeNhiYear / buildRequiredDocs）
- 氏名は外国人検索コンボボックス（紐づけ + 詳細リンク、「+新規登録」）
- データはSupabase（`municipalities` 14件、`judgment_records` 10件を移行済み）

### 求人 / 求職（`/postings`, `/jobs`）
- 求人管理簿 + Facebook出力、チラシ出力（`/postings/flyer`）
- 求職一覧（全ステータス管理 + 期間集計）、ワンクリック状態変更

### A4印刷（`/workers/print`）
- **個人シート**: 社内用（QRあり、名前の横にID）/ 会社提出用（QRなし・ID非表示）
- **一覧表**: 在留許可日の対象期間で外国人を抽出。A4横（landscape）、2ページ目以降もヘッダー繰り返し
  - 列: No / ID / 氏名 / フリガナ / 生年月日 / 性別 / 現在の在留資格 / 在留許可日 / 在留期限 / 国籍 / 雇用開始年月日 / 退職年月日 / 配属先営業所 / 居住先
  - **ID列は社内用のみ**（社内用/会社提出用のサブトグルで切替。会社提出用はID非表示）
- 通知書検索（`/notices/search`）

### 通知書（`/notices/search`）
- 通知書の検索

---

## 3. 未完成 / 保留中の機能

- **PWAアイコンの最終確認**: 実ロゴのエンブレム部分をトリミングして生成済み。文字（社名）は入れていない。「白背景→紺背景に」「余白調整」などの微修正は未対応（要望があれば対応）
- **履歴書PDFからの取込**: ユーザーからPDF取込の要望あり。現状の `/workers/import` は JSON + CSV のみ対応。**PDF（履歴書）からの取り込みは未実装**
- **未適用SQLマイグレーションの確認**: DBマイグレーションは手動運用（後述）。最新の `0024_worker_code` および `municipalities`/`judgment_records` の投入がSupabase本番に適用済みか、次回セッション開始時に要確認

---

## 4. 今後実装予定 / 検討事項

- 履歴書PDF取込（OCR/構造化）による外国人情報の自動入力
- PWAアイコンのデザイン微調整（背景色・余白・文字有無）
- （必要に応じて）在留更新・パスポート更新のリマインド通知の自動化
- 郵送請求ツールの判定ロジック・自治体マスタの拡充

> ※上記は現時点の想定。優先度はユーザー確認のうえ決定する。

---

## 5. 重要な仕様

### DBマイグレーション（最重要）
- **必ず追加のみ（ADDITIVE ONLY）**。`alter table ... add column if not exists` / `create table if not exists` を使い、**破壊的変更（drop / 型変更でのデータ損失）は禁止**
- マイグレーションは `supabase/migrations/` に連番で保存（現在 `0001`〜`0024`）
- **本番DBへの適用はユーザーが手動**で Supabase SQL Editor に貼って実行する。**このエージェントからSQLは実行できない**
  - 新規SQLは `SendUserFile` でユーザーに渡し、手動実行してもらう運用
  - RLSで弾かれるデータ投入は「Run without RLS」で実行してもらう

### Git運用
- 開発ブランチ: `claude/phase-3-foreign-career-screens-0vtb8c`
- フロー: フィーチャーブランチにコミット/プッシュ → `main` を **fast-forward** で追従 → main もプッシュ
- コミットメッセージ末尾に付与:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KRHVq1UJevhggKTX9GNEVq
  ```
- **プルリクエストはユーザーが明示的に要求したときのみ作成**

### 外国人ID（worker_code）
- 形式: 「大文字英字1文字（国籍）-数字」
- 国籍→英字の対応（`src/lib/worker-code.ts`）: ベトナム=V, カンボジア=C, フィリピン=P, インドネシア=I, ミャンマー=M, ネパール=N, タイ=T, モンゴル=O, スリランカ=S, バングラデシュ=B, ラオス=L, 中国=Z
- 登録時に自動採番（`WorkerInput` は `worker_code` を除外した型）
- 一覧表・社内用印刷にのみ表示、会社提出用には出さない

### 在留更新対象の判定
- 在留期限の3ヶ月前で対象化
- **退職者（status="退職"）と審査中（進行中の申請がある外国人）は除外**（`src/lib/renewal-filter.ts` の `UNDER_REVIEW_STATUSES` / `underReviewWorkerIds`）
- 外国人管理「在留期限3ヶ月以内」カードと在留更新対象ページは同一コンポーネント表示（`WorkerRenewalCard`）

### 申請書類用の通算計算
- **起算日ベース**（各期間の日数合計ではない）
- 最初の通算対象（特定技能1号 / 特定活動）期間の開始日から書類作成日までを月数換算し、**端数の日があれば1ヶ月切り上げ**
- 例: 起算 → 2026.6.25 で「2年3か月」

### 印刷（A4）
- 個人シート = A4縦、一覧表 = A4横（`@page { size }` を動的切替）
- 一覧表のヘッダーは `thead` を `table-header-group` にして全ページ繰り返し

---

## 6. 注意点

- **チャットに貼られた画像はファイルとして読めない**ことがある。その場合はセッションのトランスクリプト（`~/.claude/projects/.../<session>.jsonl`）に base64 で埋め込まれているので、そこから抽出できる（今回のロゴはこれで取得した）。ユーザーへ「ファイルで再送を」と頼む前に確認する
- **sharp はプロジェクトの `node_modules` にある**。スクラッチパッドから直接 `require('sharp')` すると解決できないので、`cd /home/user/immigration-app` してから node を実行する
- **デプロイ反映にラグがある**。「変わってない」という指摘は多くがVercelのデプロイ待ち/キャッシュ。過去にGitHub障害でVercelのデプロイがQueuedのまま詰まった事例あり。まずデプロイ状況を確認する
- **所属機関・氏名の入力は原則コンボボックス**（手入力→候補表示、`Combobox` コンポーネント）。プレーンなセレクト/テキストに戻さない
- ESLintの `react-hooks/static-components` / set-state-in-effect ルールが厳しめ。インラインでコンポーネントを定義しない（モジュールスコープに出す）
- searchParams は Promise（Next.js 16）。`await searchParams` してから使う
- 既存データは常に保持する前提。取込時の重複（会社名など）は空白正規化してマージする

---

## 参考: 主要ファイル早見表

| 対象 | ファイル |
|------|----------|
| ナビ定義 | `src/lib/nav-items.ts` |
| DB行型 | `src/types/db.ts` |
| 外国人クエリ | `src/lib/supabase/queries/workers.ts` |
| 在留/パスポートアラート | `src/lib/worker-alerts.ts`, `src/lib/renewal-filter.ts` |
| パスポート国籍別案内 | `src/lib/passport-guides.ts` |
| 外国人ID採番 | `src/lib/worker-code.ts` |
| 郵送請求ロジック/クエリ | `src/lib/tax-cert.ts`, `src/lib/supabase/queries/tax-cert.ts` |
| Notion CSV取込 | `src/lib/ssw/notion-csv.ts` |
| 外国人詳細（通算パネル等） | `src/app/(app)/workers/[id]/WorkerDetail.tsx` |
| A4印刷 | `src/app/(app)/workers/print/page.tsx`, `PrintClient.tsx` |
| 更新カード（共有） | `src/components/workers/WorkerRenewalCard.tsx` |
| PWA | `src/app/manifest.ts`, `src/app/layout.tsx`, `public/icon-*.png` |
