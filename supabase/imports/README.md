# 過去データの取り込み用SQL（imports）

`supabase/migrations/` は「表や列の形」を変えるもの、この `imports/` は
「中身のデータを入れる」ためのものです。番号順に Supabase の SQL Editor で実行します。

- `0001_recruit_ledger_check.sql` … 求人管理簿・求職管理簿（2025年4月〜2026年3月）の
  取り込み前の確認だけ（データは変わりません）。会社・外国人が登録済みかを見ます。
- `0002_recruit_ledger_import.sql` … 上の確認結果に合わせて作る取り込み本体。
