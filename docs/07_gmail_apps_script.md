# 入管メール通知（Gmail連携）セットアップ手順

Gmailに届く入管からのメール（許可・申請受付など）を、入管申請管理システムの
**ベル通知＋お知らせ一覧**に自動で表示するための設定手順です。

## 仕組み

```
Gmail（入管メール）
  └─ Google Apps Script（数分おきに新着を検索）
       └─ POST /api/mail/inbound（共有シークレットで認証）
            └─ mail_notifications テーブルに登録（氏名で申請へ自動紐づけ）
                 └─ アプリのベル🔔・お知らせ一覧に表示
```

- 二重取り込み防止: サーバー側は Gmail のメッセージIDで、Apps Script 側は「同期済」ラベルで重複を防ぎます。
- 氏名の自動紐づけ: メール本文・件名に含まれる外国人の氏名（またはフリガナ）から、該当する申請へ自動でリンクします。外れた場合はお知らせ一覧の「紐づけ修正」で直せます。

---

## 手順1: DBマイグレーションを適用

`supabase/migrations/0025_mail_notifications.sql` を Supabase の SQL Editor に貼って実行してください（既存の運用どおり）。

## 手順2: 環境変数を設定（Vercel）

Vercel のプロジェクト設定 → Environment Variables に以下を追加します。

| 変数名 | 値 |
|--------|-----|
| `MAIL_INBOUND_SECRET` | 推測されない長いランダム文字列（例: パスワード生成で32文字）。**手順3のスクリプトと同じ値**にする |
| `SUPABASE_SERVICE_ROLE_KEY` | 既に設定済みのはず（未設定なら Supabase の service_role キー） |

追加後、再デプロイして反映させます。

## 手順3: Google Apps Script を設定

1. https://script.google.com を開き「新しいプロジェクト」を作成
2. 下のコードを全部貼り付け
3. 冒頭の `APP_URL` と `SECRET` を自分の値に書き換え
   - `APP_URL`: `https://（あなたのアプリのドメイン）/api/mail/inbound`
   - `SECRET`: 手順2の `MAIL_INBOUND_SECRET` と**まったく同じ文字列**
4. `QUERY` を入管メールに合わせて調整（下の「検索条件の調整」を参照）
5. 保存 → 関数 `syncImmigrationMails` を選んで一度「実行」。初回は Google の認可（Gmail・外部接続の許可）を求められるので許可する
6. 左の時計アイコン（トリガー）→「トリガーを追加」
   - 実行する関数: `syncImmigrationMails`
   - イベントのソース: 時間主導型 → 分ベースのタイマー → **5分おき**

```javascript
// ===== 設定（ここを自分の値に変更）=====
const APP_URL = 'https://YOUR-APP.vercel.app/api/mail/inbound';
const SECRET  = 'YOUR_MAIL_INBOUND_SECRET';

// 入管メールを拾うGmail検索条件。実際の差出人・件名に合わせて調整する（下の説明を参照）
const QUERY = 'newer_than:14d (from:moj.go.jp OR subject:(在留 OR 許可 OR 認定 OR 受付))';

// 同期済みメールに付けるラベル（重複送信の防止用）
const DONE_LABEL = '入管通知-同期済';
// =====================================

function syncImmigrationMails() {
  const label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const threads = GmailApp.search(QUERY + ' -label:' + DONE_LABEL, 0, 30);
  if (threads.length === 0) return;

  const messages = [];
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      const plain = m.getPlainBody() || '';
      messages.push({
        id: m.getId(),
        subject: m.getSubject(),
        from: m.getFrom(),
        snippet: plain.slice(0, 300).replace(/\s+/g, ' ').trim(),
        body: plain.slice(0, 4000),
        receivedAt: m.getDate().toISOString(),
        link: 'https://mail.google.com/mail/u/0/#all/' + m.getId()
      });
    });
  });

  const res = UrlFetchApp.fetch(APP_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-webhook-secret': SECRET },
    payload: JSON.stringify({ messages: messages }),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code === 200) {
    // 送信成功したスレッドにだけ「同期済」ラベルを付ける
    threads.forEach(function (t) { t.addLabel(label); });
    Logger.log('synced: ' + res.getContentText());
  } else {
    throw new Error('sync failed ' + code + ': ' + res.getContentText());
  }
}
```

### 検索条件（QUERY）の調整

`QUERY` は Gmail の検索窓と同じ書き方です。確実に拾うために、実際の入管メールを1通開いて
**差出人アドレス**を確認し、そのアドレスで絞るのがおすすめです。

例:
- 差出人で絞る: `from:no-reply@example.moj.go.jp newer_than:30d`
- 特定のラベル/フィルタを使う: Gmail側で入管メールに手動ラベル「入管」を付けている場合 `label:入管 newer_than:30d`
- 件名で絞る: `subject:(在留期間更新 OR 在留資格変更 OR 認定証明書 OR 申請受付) newer_than:30d`

> `newer_than:14d` は「過去14日以内」。初回だけ広め（例 `newer_than:60d`）にして過去分を取り込み、
> その後は短くしてもOKです（`-label:入管通知-同期済` があるので二重登録はされません）。

---

## 動作確認

1. Apps Script で `syncImmigrationMails` を手動実行 → 実行ログに `synced: {"inserted":N,...}` が出る
2. アプリを開く → 右上（スマホはヘッダー、PCはサイドナビ）のベル🔔に未読数が付く
3. 「お知らせ一覧」で内容・自動紐づけを確認。外れていれば「紐づけ修正」で申請を選び直す

## うまくいかないときの確認ポイント

- ベルに何も出ない: `MAIL_INBOUND_SECRET` がVercelとApps Scriptで一致しているか
- 実行ログが 401: シークレット不一致 / 503: `MAIL_INBOUND_SECRET` か `SUPABASE_SERVICE_ROLE_KEY` 未設定
- メールが拾われない: `QUERY` が実際の差出人・件名に合っているか（手動実行で件数を確認）
- 紐づかない: メール文面の氏名表記が外国人名簿の氏名/フリガナと一致しているか（英字表記のみ等は自動では外れることがある）
