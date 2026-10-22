-- 督促の「残りの納付書を本人へ郵送した」記録（0163 の箱なしの追加）。
--
-- 番号の箱（1〜30）は納付書が手元にある人のもの。当社が代わりに全部払ったときだけでなく、
-- 全部納付済みになったとき・残りの納付書を本人へ郵送して手元に無くなったときも、
-- 箱から出して番号を空ける（reminder_no = 0）。郵送した日と追跡番号などのメモを残す。
-- 何度実行しても安全（add column if not exists）。
alter table reminders
  add column if not exists slips_mailed_on date,                        -- 残りの納付書を本人へ郵送した日
  add column if not exists slips_mailed_note text not null default '';  -- 郵送のメモ（追跡番号・何を送ったか）

comment on column reminders.slips_mailed_on is '残りの納付書を本人へ郵送した日（入れると納付書が手元に無いので番号の箱から出る）';
comment on column reminders.slips_mailed_note is '納付書の郵送のメモ（追跡番号・何を送ったか）';
