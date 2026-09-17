-- 印鑑BOX（メニュー ＞ 保管ボックスの下）。
-- 外国人のために作った印鑑（フリガナで彫ったもの）を箱に入れて保管し、
-- 本人に渡したら「譲渡」で渡した日を記録して、箱の中には無いことを出す。
-- フリガナが外国人のフリガナの一部に当てはまれば、外国人詳細の名前の横に「印鑑あり」を出す。
-- 何度実行しても安全（if not exists / drop policy if exists）
create table if not exists seals (
  id              uuid primary key default gen_random_uuid(),
  kana            text not null,               -- 印鑑に彫ったフリガナ（例: グエン）
  note            text not null default '',    -- メモ（書体・サイズ・作った理由など）
  made_on         date,                        -- 作成日（分かれば）
  transferred_on  date,                        -- 本人に譲渡した日（null = 箱の中にある）
  transferred_to  uuid references workers (id) on delete set null, -- 譲渡した外国人（分かれば）
  created_by      uuid references profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_seals_in_box on seals (transferred_on, kana);

comment on table public.seals is '印鑑BOX（外国人用に作った印鑑の保管・譲渡の記録）';
comment on column public.seals.kana is '印鑑に彫ったフリガナ。外国人のフリガナの一部に当てはまれば外国人詳細に印鑑ありを出す';
comment on column public.seals.transferred_on is '本人に譲渡した日。null なら箱の中にある';

alter table seals enable row level security;
drop policy if exists sel_seals on seals;
drop policy if exists ins_seals on seals;
drop policy if exists upd_seals on seals;
drop policy if exists del_seals on seals;
create policy sel_seals on seals for select using (my_role() is not null);
create policy ins_seals on seals for insert with check (my_role() in ('admin', 'staff'));
create policy upd_seals on seals for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_seals on seals for delete using (my_role() in ('admin', 'staff'));

drop trigger if exists seals_updated on seals;
create trigger seals_updated before update on seals
  for each row execute procedure moddatetime(updated_at);
