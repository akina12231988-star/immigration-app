# 外国人入管申請管理システム — システム設計書 (Stage 1)

最終更新: 2026-07-06

## 1. 目的

外国人の入管申請業務をスマートフォンだけで完結させ、Google スプレッドシート・Google Drive・Notion を連携した申請管理システムを構築する。業務入力の自動化と、社内全員がリアルタイムで進捗を確認できる仕組みを実現する。

## 2. 全体アーキテクチャ

```mermaid
flowchart LR
    subgraph Client["クライアント（スマホ/PC ブラウザ）"]
        UI[Next.js フロントエンド]
    end

    subgraph Server["Next.js サーバー（Vercel）"]
        API[API Routes / Server Actions]
        Auth[NextAuth.js\nGoogleログイン]
    end

    subgraph Google["Google Cloud"]
        Sheets[Google Sheets API]
        Drive[Google Drive API]
        Vision[Google Vision API]
        OAuth[Google OAuth]
    end

    Notion[Notion API]

    UI <--> API
    UI <--> Auth
    Auth <--> OAuth
    API <--> Sheets
    API <--> Drive
    API <--> Vision
    API <--> Notion
```

Next.js の App Router に フロントエンドと API を統合し、別立ての Node.js サーバーは持たない。理由: デプロイ・保守対象を1系統に絞ることで、社内運用の長期保守性を優先する。Sheets/Drive はサービスアカウント経由でサーバーサイドからのみアクセスし、クライアントに認証情報を渡さない。

## 3. データフロー（業務プロセス全体）

```mermaid
flowchart TD
    A[① 受付票撮影/選択] --> B[OCR: Google Vision API]
    B --> C[手入力・修正]
    C --> D[② Google Drive 保存]
    D --> E[③ Google Sheets 登録]
    E --> F[④ Notion 自動同期]
    F --> G[⑤ LINE報告文生成 → コピー]
    G --> H[⑥ 報告済ボタン → Sheets/Notion更新]
    H --> I[⑦ 通知書撮影/選択/番号入力 → OCRで検索]
    I --> J[⑧ 許可済ボタン → 許可日自動入力・Sheets/Notion更新]
    J --> K[⑨ ステータス: 許可済]
```

## 4. データモデル

### 4.1 Google Sheets（正データベース）

1シート1行 = 1申請。列構成:

| 列 | 項目 | 型 / 備考 |
|---|---|---|
| A | ID | UUID。重複チェックと Notion 同期キーに使用 |
| B | 氏名 | 文字列 |
| C | 申請日 | 日付（YYYY-MM-DD） |
| D | 申請番号 | 文字列。重複チェック対象 |
| E | 申請内容 | 固定3択（在留資格の変更許可／在留期間の更新許可／在留認定許可申請） |
| F | 申請方法 | 固定2択（窓口申請／オンライン申請） |
| G | メールリンク | オンライン申請時: 確認メールに記載されたURL |
| H | メール本文 | オンライン申請時: 確認メール本文の転記 |
| I | 受付票画像URL | Google Drive 共有リンク（窓口申請時） |
| J | 通知書画像URL | Google Drive 共有リンク |
| K | 在留カード画像URL | Google Drive 共有リンク（複数画像は 4.2 参照） |
| L | 許可日 | 日付。⑧の操作で自動入力 |
| M | LINE報告済 | boolean |
| N | Notion同期済 | boolean |
| O | 許可済 | boolean |
| P | ステータス | enum: 申請前 / 申請済 / LINE報告済 / 通知書到着 / 許可済 |
| Q | 担当者 | 文字列。ログインユーザーのメールアドレスから自動設定 |
| R | 登録日時 | timestamp（自動） |
| S | 更新日時 | timestamp（更新の都度自動更新） |
| T | Notion Page ID | Notion 側ページとの紐付けキー |

**申請方法による登録フローの違い:**
- 窓口申請: 入管窓口で受け取った受付票を撮影・選択 → OCRは行わず全項目手入力
- オンライン申請: 受付票の撮影は行わず、確認メールのリンクURLと本文を転記 → その他項目は手入力

先頭行をヘッダー行とし、シート名は `申請管理台帳` とする。

### 4.2 画像管理（Google Drive）

- 申請ごとにフォルダを自動作成: `申請管理/{申請番号}_{氏名}/`
- ファイル名規則: `{種別}_{申請日}_{氏名}_{申請番号}.jpg`
  - 種別: 受付票 / 通知書 / 在留カード
  - 例: `受付票_2026-07-06_グエン・ヴァン・A_123456.jpg`
- Sheets の I/J/K 列に各種別の Drive 共有リンクを保持する。将来的に1種別につき複数枚が必要になった場合は、Drive フォルダ内一覧へのリンクに切り替える拡張余地を残す。

### 4.3 Notion Database

Sheets と同一のプロパティ構成をミラーリングする。同期は **Sheets → Notion の一方向**とし、Notion側を直接編集しても Sheets には反映されない設計にする（データ競合防止・保守性のため source of truth を1つに固定）。Sheets の T列（Notion Page ID）で対応するページを特定し、UPSERT する。

## 5. ステータス状態遷移

```
申請前 → 申請済 → LINE報告済 → 通知書到着 → 許可済
```

一方向のみの遷移とし、逆戻りは想定しない（誤操作時は担当者が個別修正）。UI 上は色分け表示する（Stage 2 の画面デザインで配色を確定）。

## 6. 重複チェック

- **申請番号が既存行と一致**: 登録をブロックし、警告ダイアログを表示（上書きは個別に明示操作が必要）
- **氏名＋申請日が一致**（申請番号は異なる）: 確認メッセージを表示するが登録は継続可能

## 7. 認証・セキュリティ設計

- ログイン: NextAuth.js (Auth.js) + Google Provider。社内ドメイン／許可メールアドレスのホワイトリストでアクセス制御し、対象外アカウントは弾く
- Google Sheets / Drive へのアクセスは **Google Apps Script（GAS）のウェブアプリ**経由（サーバーサイドのみ）で行う。Google Cloud のプロジェクト作成・サービスアカウント発行・請求先アカウント登録を避けるため、GCPを使わずGoogleアカウント自身の権限で完結するGASをバックエンドとして採用する（詳細は [docs/apps-script/Code.gs](./apps-script/Code.gs)）
- Next.js の API Routes から GAS ウェブアプリへ POST する際、共有シークレット文字列（`GAS_SECRET`）をボディに含めて認証する。このシークレットはサーバーサイド環境変数としてのみ保持し、クライアントバンドルに一切含めない
- Notion Integration Token も同様にサーバーサイド環境変数として保持する
- API Routes 側で入力バリデーション（画像サイズ上限・許可 MIME タイプ・文字列長）を実装
- 環境変数は `.env.local`（ローカル）／ Vercel の Environment Variables（本番）で管理し、リポジトリにコミットしない

## 8. 入力方式（OCRは採用しない）

当初案では Google Vision API による OCR 自動読み取りを検討したが、以下の理由から不採用とし、**全項目手入力**に変更した。

- Google Cloud の Vision API は有効化に請求先アカウントの登録が必要であり、社内利用のみのツールとして請求設定を避けたい
- 手入力の方が誤読による訂正の手間がなく、シンプルに運用できる

代わりに、申請方法（窓口申請／オンライン申請）によって入力導線を分ける。

- **窓口申請**: 受付票を撮影・選択して画像として保存 → 氏名・申請日・申請番号・申請内容・担当者を手入力
- **オンライン申請**: 受付票の画像はなし → 確認メールに記載されたリンクURLと本文をそのまま転記 → その他項目は手入力

将来的にOCRを再検討する場合は、この手入力フォームの初期値を埋める形で追加できるよう、フォーム状態管理を分離しておく。

## 9. 通知機能（LINE Notify 終了への対応）

LINE Notify は 2025年3月末にサービス終了済みのため、自動 LINE 通知は行わない。代わりに **アプリ内通知**として実装する:

- ダッシュボードにバッジ表示: 未報告件数 / 通知書未登録件数 / 許可未処理件数
- 一覧画面で該当行を警告色でハイライト

⑤の LINE 報告文は引き続き「文章生成＋コピー ボタン」を提供し、実際の送信は担当者が LINE アプリで手動で行う（要件通り、API 送信は行わない）。

将来 LINE 公式アカウント（Messaging API）による自動送信に切り替える場合は、通知ロジックを `lib/notification/` に集約しておき、差し替えポイントとして扱う。

## 10. 技術スタック・プロジェクト構成

- フロントエンド/バックエンド: Next.js 14+ (App Router, TypeScript)
- ホスティング: Vercel
- スタイリング: Tailwind CSS（ダークモード対応・iPhone操作性重視のユーティリティベース）
- データ取得: Server Components 中心、クライアント側の再検証には SWR を使用
- ディレクトリ構成:

```
/app                  ルーティング（App Router）
/components           UIコンポーネント
/lib/google           Sheets / Drive / Vision クライアントラッパー
/lib/notion           Notion API ラッパー
/lib/ocr              OCR パーサー
/lib/status           ステータス状態遷移ロジック
/lib/notification      アプリ内通知ロジック（将来のLINE連携差し替えポイント）
/types                共有型定義
/docs                 設計ドキュメント
```

## 11. 開発ステップ（再掲）

1. システム全体の設計 ← 本ドキュメント（Stage 1）
2. 画面デザイン作成
3. Google ログイン
4. Google スプレッドシート連携
5. Google Drive 画像保存
6. OCR 実装
7. Notion 連携
8. LINE 報告文作成
9. 通知書検索
10. ステータス管理
11. ダッシュボード
12. 最終テスト

各段階完了時に動作確認を行い、合意を得てから次段階へ進む。
