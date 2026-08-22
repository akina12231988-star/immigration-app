-- 出入国の記録に、上陸許可シールの内容（そのとき許可された在留資格）を足す。
-- 上陸許可シールで日本に入国した場合、シールに書かれた在留資格
-- （例: 特定技能1号・技能実習1号ロ・短期滞在）をその往復に記録する。
alter table public.worker_travels
  add column if not exists landing_permission text not null default '';

comment on column public.worker_travels.landing_permission is
  '上陸許可シールの在留資格（例: 特定技能1号。日本入国時のもの。0098）';
