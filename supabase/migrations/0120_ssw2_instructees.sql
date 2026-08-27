-- 特定技能2号の申請で出す「２号特定技能外国人の業務内容に関する誓約書」
-- （参考様式第１－３２号）の「２ 当該２号特定技能外国人に指導を受ける対象者一覧」。
--
-- 2号を申請する外国人1人につき、指導を受ける対象者を数名ぶら下げる。
-- 対象者はアプリに登録がある外国人（同じ所属機関の1号・技能実習生など）でも、
-- 登録の無い日本人従業員（手入力）でもよい。
--
-- 様式の留意事項4「在留諸申請時点で、他の２号特定技能外国人に指導を受けている者に
-- ついては記載しないこと」を守るため、登録がある外国人は
-- 一意制約で「1人につき1か所まで」にする（人が気をつけるのではなく、DBで防ぐ）。
create table if not exists ssw2_instructees (
  id uuid primary key default gen_random_uuid(),
  -- 2号を申請する外国人
  worker_id uuid not null references workers(id) on delete cascade,
  -- 対象者がアプリに登録のある外国人のとき、その人。日本人など登録が無い場合は null
  target_worker_id uuid references workers(id) on delete set null,
  name text not null default '', -- 対象者の氏名
  residence_card_no text not null default '', -- 在留カード番号（外国人のみ）
  office text not null default '', -- 事業所及び所属部署名
  position text not null default '', -- 役職又は地位
  duties text not null default '', -- 指導を受ける職務内容
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ssw2_instructees_worker_idx on ssw2_instructees (worker_id);

-- 同じ外国人が2人以上の2号申請者の対象者になることを防ぐ（様式の留意事項4）
create unique index if not exists ssw2_instructees_target_uniq
  on ssw2_instructees (target_worker_id)
  where target_worker_id is not null;

alter table ssw2_instructees enable row level security;

drop policy if exists sel_ssw2_instructees on ssw2_instructees;
create policy sel_ssw2_instructees on ssw2_instructees for select
  using (my_role() is not null);
drop policy if exists ins_ssw2_instructees on ssw2_instructees;
create policy ins_ssw2_instructees on ssw2_instructees for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_ssw2_instructees on ssw2_instructees;
create policy upd_ssw2_instructees on ssw2_instructees for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_ssw2_instructees on ssw2_instructees;
create policy del_ssw2_instructees on ssw2_instructees for delete
  using (my_role() in ('admin', 'staff'));

drop trigger if exists ssw2_instructees_updated on ssw2_instructees;
create trigger ssw2_instructees_updated before update on ssw2_instructees
  for each row execute procedure moddatetime(updated_at);
