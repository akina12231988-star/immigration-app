-- オンライン申請の受付メールは3通に分かれて届く（0205 の2通から広げる）。
--   1通目「申請受付完了のお知らせ」: 申請種別・整理番号（email_link）
--   2通目「申請受付仮番号のお知らせ」: 申請受付日・申請受付仮番号・申請種別・申請人在留カード等番号（online_mail2_link）
--   3通目「申請受付番号のお知らせ」: 申請受付番号（application_no）とそのメールのリンク（online_mail3_link）
-- 2通目のスクリーンショットは「受付仮番号メール」、3通目は「受付番号メール」として残す。
-- 何度実行しても安全（if not exists）
alter table immigration_applications
  add column if not exists online_mail3_link text not null default '';  -- 3通目（申請受付番号）のメールのリンク

alter table application_files drop constraint if exists application_files_kind_check;
alter table application_files add constraint application_files_kind_check
  check (kind in ('受付票', '通知書', '在留カード', '照合結果', '指定書', '追加資料通知', '受付完了メール', '受付仮番号メール', '受付番号メール', 'その他'));
