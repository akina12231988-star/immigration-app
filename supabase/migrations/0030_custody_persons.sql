-- 保管ボックスの「持ち出す人」名簿（選択リスト。画面から新規追加できる）
create table if not exists custody_persons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

alter table custody_persons enable row level security;

create policy sel_custody_persons on custody_persons for select using (my_role() is not null);
create policy ins_custody_persons on custody_persons for insert with check (my_role() in ('admin', 'staff'));
create policy del_custody_persons on custody_persons for delete using (my_role() in ('admin', 'staff'));

-- 初期メンバー
insert into custody_persons (name) values
  ('VUONG VAN THANH'),
  ('野口明菜'),
  ('市原彩奈'),
  ('田上夏季'),
  ('秋吉伽恋'),
  ('大元麗奈')
on conflict (name) do nothing;
