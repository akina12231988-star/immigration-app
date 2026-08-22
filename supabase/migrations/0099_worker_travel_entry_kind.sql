-- 出入国の記録に「入国の種類」を足す。
-- 日本入国が、上陸許可（新しい在留資格のシール）での入国か、
-- 再入国（みなし再入国許可などで、在留資格はそのまま）での入国かを残す。
-- 値: '' = 未設定 / '上陸許可' / '再入国'
alter table public.worker_travels
  add column if not exists entry_kind text not null default '';

comment on column public.worker_travels.entry_kind is
  '日本入国の種類（上陸許可／再入国。空は未設定。0099）';
