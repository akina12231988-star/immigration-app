# 過去データの取り込み用SQL（imports）

`supabase/migrations/` は「表や列の形」を変えるもの、この `imports/` は
「中身のデータを入れる」ためのものです。番号順に Supabase の SQL Editor で実行します。

- `0001_recruit_ledger_check.sql` … 求人管理簿・求職管理簿（2025年4月〜2026年3月）の
  取り込み前の確認だけ（データは変わりません）。会社・外国人が登録済みかを見ます。
- `0002_recruit_ledger_import.sql` … 上の確認結果に合わせて作る取り込み本体。
- `0003_recruit_ledger_r8_check.sql` … 令和8年度（2026/4/1〜2027/3/31）の求人管理簿・
  求職管理簿の取り込み前の確認だけ（データは変わりません）。
- `0004_recruit_ledger_r8_import.sql` … 令和8年度ぶんの取り込み本体。
  求人21件・求職者72名・紹介76件。求職受付番号が前年度のものだった人は今年度の番号に
  置き換えます（アプリは1人1つしか持てないため）。
- `0005_merge_duplicate_org.sql` … 二重登録の所属機関をまとめる。
- `0006_check_duplicate_application_no.sql` / `0008_check_duplicate_applications.sql` …
  申請番号の二重登録の確認だけ。`0009_delete_duplicate_applications.sql` がその整理。
- `0007_move_gensen_doc_key.sql` … 源泉徴収票の書類キーを `gensen_r{令和年}` に移す。
- `0010_fix_address_typo.sql` … 住所の誤字（男払郡 → 勇払郡）を直す。
- `0011_check_address_mismatch.sql` / `0012_check_address_diff.sql` … 基本情報の住所と
  住所歴の最新が食い違っている人の確認だけ（0012は住所を全文で見比べます）。
- `0013_posting_sheet_check.sql` … Notionの求人管理簿（令和8年度・R8KJN-◯◯）に入力した
  求人票の内容を、求人詳細の「求人票（特定技能1号）」欄に入れる前の確認だけ。
- `0014_posting_sheet_import.sql` … 上の取り込み本体（21件）。画面から入れた内容は
  上書きしません。先に `0090_job_posting_sheet.sql` の実行が必要です。
