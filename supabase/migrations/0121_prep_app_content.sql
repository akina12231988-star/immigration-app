-- 申請準備の「申請種別」を、準備の内容（只今の状況）と同じ7つの言い方で選べるようにする。
--
-- これまでの app_type（変更／更新／認定／特定活動）は必要書類のチェックリストを
-- 決めるのに使っているのでそのまま残し、選んだ7つのどれかを app_content に持たせる。
-- 中身は「只今の状況」の保存値（例: 特定技能2号申請準備中）。
alter table application_prep_checklists
  add column if not exists app_content text not null default '';
