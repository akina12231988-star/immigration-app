-- 督促の「金額」と「誰が払うか」（一覧表用）。
--
-- 納付書などの金額と、本人が払うのか・当社が代わりに払う（立替）のかを督促ごとに持つ。
-- 代わりに払うときは 0150 の立替払い（advance_*）で返金を追いかける。
-- 何度実行しても安全（add column if not exists）。
alter table reminders
  add column if not exists amount integer,                    -- 金額（円。納付書などの額）
  add column if not exists payer  text not null default ''    -- 誰が払うか: '' / 本人 / 代わり
    check (payer in ('', '本人', '代わり'));
