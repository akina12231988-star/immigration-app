# 業務システム拡張 実装計画（レスポンシブ・生活オリエンテーション・Google Drive 他）

最終更新: 2026-07-14

本計画は9項目の拡張要件を、既存機能を壊さずに段階実装するための設計。各フェーズは独立して動作確認・デプロイできる順序で並べる。

## 現状分析（要点）

- Next.js 16 / React 19 / Tailwind 4 / Supabase。認証・RLS・Storage 実装済み
- **全画面が `max-w-lg`（スマホ幅固定）**。PC でも中央に細く表示される → ①で全面改修
- 下部タブ（BottomNav）は5項目。申請・外国人・求人・求職は実装済み
- 申請（immigration_applications）・求人（job_postings）・求職（job_applications）・採用（employments）・職歴（work_histories）は既存。マイグレーション 0001〜0012
- Google Drive 連携なし。画像は Supabase Storage（非公開バケット app-files / worker-files）

## フェーズ分割

### Phase A: レイアウト基盤（①レスポンシブ ＋ ②ナビ再編）— 最優先・全機能の土台
- `AppShell` を新設: モバイル=下部タブ（横スクロール可）、**PC=左サイドナビ＋広い本文（横幅いっぱい）**
- ブレークポイントは Tailwind `lg`（1024px）。`max-w-lg` を撤廃し、コンテンツは `w-full` ＋ 適度な `max-w`（一覧は全幅）
- 下部タブ順を要件②へ: ホーム / 外国人 / 申請登録 / 申請一覧 / 通知書 / 生活オリエンテーション / 求人一覧 / 求職一覧
- 一覧の**PC時テーブル表示**用の共通 `DataTable` を追加（モバイルは既存カード、PCはテーブル）
- 既存ページは中身を保ったままシェルとコンテナ幅のみ差し替え（挙動は不変）

### Phase B: DBマイグレーション 0013（②〜⑦の土台をまとめて）
- `workers` に追加: `photo_path`(顔写真)・`messenger_link`。既存の在留カード番号/許可日/期限日列は流用（許可処理で自動更新）
- `immigration_applications` に追加: `residence_expiry_at_apply`(申請時点の在留期限)・`is_self_apply`(本人申請)・`receipt_scheduled_on`(受取予定日)・`receipt_reason`(受取理由)・`residence_card_no`・`residence_permit_date`・`residence_expiry_date`・`employment_start_on`(雇用開始日)・`report_org_honorific`(御中/様)
- 新規テーブル `orientations`(生活オリエンテーション): worker_id・organization_id・application_id・scheduled_on・status(未実施/実施済)・done_on・drive_folder・note
- 新規テーブル `orientation_files` または既存 application_files を汎用化して資料メタを保存（Drive のファイルID/リンクも保持）
- 追加 enum 値・RLS・grants（既存 0006/0007/0011 と同方針）
- **既存データは一切削除しない**（すべて add column / create table のみ）

### Phase C: ③申請登録の刷新 ＋ ⑤許可処理 ＋ 登録順変更
- 申請登録: 外国人選択に該当者がなければ「氏名だけで外国人を新規登録→続けて詳細入力」導線（登録後にアラート表示）
- 追加項目: 所属機関(既存選択)・申請内容・申請日・申請番号・申請時点の在留期限・申請取次士(本人申請フラグ)
- 一覧表示項目を要件③へ（名前・所属機関・申請内容・申請日・申請番号・申請時点在留期限）。PC はテーブル
- 許可処理: 「許可済みにする」→「入管から許可がおりた通知あり」に改称。受取予定日・受取理由・Messengerリンク表示・在留カード/指定書画像・在留カード番号・在留許可日・在留期限日・雇用開始日・**許可のLINE報告文（所属機関名＋御中/様選択）**
- 許可確定時に workers の在留カード番号・許可日・期限日を**自動更新**（⑦）

### Phase D: ④アラート機能
- 申請後・未受取で「申請時点の在留期限」から1か月経過した案件を検出（純粋関数＋テスト）
- 一覧・詳細で赤表示、ホームに通知件数バッジ

### Phase E: ⑥生活オリエンテーション ＋ Google Drive 連携
- 特定技能1号のみ対象。雇用開始日入力→**2週間後の日曜日**を予定日として自動生成（純粋関数＋テスト）
- 管理画面 `/orientations`: 未実施/実施済の管理。実施済で資料アップロード
- **資料の保存先リンク方式（確定）**: Drive API連携はせず、実施済にする際に「保存先リンク」を入力する欄を設ける。
  - 推奨フォルダ名 `所属機関名＋生活オリエンテーション` / ファイル名 `外国人名＋実施日＋生活オリエンテーション` を画面にガイド表示（ユーザーが Drive 側で作成しリンクを貼る）
  - `orientations.drive_link`(text) に保存。詳細から開ける。Drive API・OAuth・環境変数は不要

### Phase F: ⑦外国人管理の拡張 ＋ ⑧印刷
- 顔写真アップロード・Messengerリンク。同姓同名対応（既に UUID 主キーのため氏名重複を許可＝現状OK、UI補足のみ）
- 所属機関フィルター → **A4印刷ビュー**（顔写真・外国人情報・最新在留カード画像・最新指定書画像・MessengerリンクのQRコード・余白なし・print CSS）

### Phase G: ⑨求人管理簿のホーム導線
- ホームに求人カード（現在の求人件数）→「詳細」で `/postings`（実装済み）へ。CRUD は実装済み

## Google Drive 連携の方式（確定: リンク入力方式）

ユーザー確認の結果、**Drive API連携は行わず、保存先リンクを入力する方式**とする。
- 実施済にする際、ユーザーが Drive 側で資料を保存し、そのフォルダ/ファイルのリンクを貼り付ける
- 推奨フォルダ名・ファイル名を画面にガイド表示（`所属機関名＋生活オリエンテーション` / `外国人名＋実施日＋生活オリエンテーション`）
- 認証情報・環境変数・サーバーAPIは不要。将来 API 連携したくなったら差し替え可能な構造にしておく

## 実装順序と安全性

- A→B→C→D→E→F→G の順。各フェーズ末で `vitest` / `eslint` / `next build` を通し、ブランチ＋mainへ push
- すべて add column / create table のみ。既存データ・既存フローは維持
- 各DB変更は `supabase/migrations/00xx_*.sql` を追加し、実行用SQLをユーザーに送付
