-- NotionのTODOデータベースをシステムに移すためのTODO機能。
-- TODOは3つの構成（申請準備 / 退職の随時報告書 / 試験の申込）で、番号は通しで自動採番する
-- （申請準備・随時報告の記録に入っている既存のNotion番号の続きから振る）。
-- ステータス（経過）の選択肢は todo_status_options に持ち、画面から随時追加・変更・削除して
-- そのまま運用できる。何度実行しても安全（if not exists / on conflict do nothing）

create table if not exists todos (
  id         uuid primary key default gen_random_uuid(),
  todo_no    text not null unique,        -- TODO番号（通し番号。Notion由来の番号と同じ体系）
  kind       text not null check (kind in ('申請準備', '退職の随時報告書', '試験の申込')),
  worker_id  uuid references workers(id) on delete set null,
  title      text not null default '',    -- 内容（何をするか）
  status     text not null default '未着手', -- 経過（todo_status_options の選択肢か自由入力）
  -- 経過が「明菜　チェック中」「彩奈　チェック中」などのチェック中のときの確認ステータス
  check_status text not null default '',
  note       text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_todos_kind_status on todos (kind, status);
create index if not exists idx_todos_worker on todos (worker_id);

-- ステータス（経過）の選択肢。stage（未着手/進行中/完了）ごとに種類別で持つ。
-- kind='チェック' は、経過が「〜チェック中」のときに出す確認ステータスの選択肢
create table if not exists todo_status_options (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('申請準備', '退職の随時報告書', '試験の申込', 'チェック')),
  stage      text not null check (stage in ('未着手', '進行中', '完了')),
  name       text not null,
  sort_no    integer not null default 0,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

alter table todos enable row level security;
alter table todo_status_options enable row level security;

drop policy if exists sel_todos on todos;
create policy sel_todos on todos for select using (my_role() is not null);
drop policy if exists ins_todos on todos;
create policy ins_todos on todos for insert with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_todos on todos;
create policy upd_todos on todos for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_todos on todos;
create policy del_todos on todos for delete using (my_role() in ('admin', 'staff'));

drop policy if exists sel_todo_opts on todo_status_options;
create policy sel_todo_opts on todo_status_options for select using (my_role() is not null);
drop policy if exists ins_todo_opts on todo_status_options;
create policy ins_todo_opts on todo_status_options for insert with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_todo_opts on todo_status_options;
create policy upd_todo_opts on todo_status_options for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_todo_opts on todo_status_options;
create policy del_todo_opts on todo_status_options for delete using (my_role() in ('admin', 'staff'));

-- ステータス（経過）の初期選択肢（Notionの選択肢を3つの構成に仕分けしたもの）
insert into todo_status_options (kind, stage, name, sort_no) values
  -- ① 申請準備
  ('申請準備', '未着手', '未着手', 1),
  ('申請準備', '進行中', '書類待ち', 1),
  ('申請準備', '進行中', 'fax/LINE依頼中', 2),
  ('申請準備', '進行中', 'fax/LINEで届いた', 3),
  ('申請準備', '進行中', '書類作成中', 4),
  ('申請準備', '進行中', '進行中（印鑑依頼中　1-5号1-6号印刷済み）', 5),
  ('申請準備', '進行中', '全印刷済（印鑑まだ）', 6),
  ('申請準備', '進行中', '進行中（✅印鑑済み）', 7),
  ('申請準備', '進行中', '署名をもらう', 8),
  ('申請準備', '進行中', '明菜　チェック中', 9),
  ('申請準備', '進行中', '彩奈　チェック中', 10),
  ('申請準備', '進行中', '必要な書類まち（AKINAチェック済み）', 11),
  ('申請準備', '進行中', 'スキャンする', 12),
  ('申請準備', '進行中', '返事待ち（郵送で届く）', 13),
  ('申請準備', '進行中', '国交省の認定待ち', 14),
  ('申請準備', '完了', '入管へ申請！！', 1),
  ('申請準備', '完了', '＜審査中＞転出届請求', 2),
  ('申請準備', '完了', '完了', 3),
  -- ② 退職の随時報告書
  ('退職の随時報告書', '未着手', '未着手', 1),
  ('退職の随時報告書', '進行中', '＜タァンに依頼＞会社から署名もらう', 1),
  ('退職の随時報告書', '進行中', '投函する', 2),
  ('退職の随時報告書', '完了', '完了', 1),
  -- ③ 試験の申込
  ('試験の申込', '未着手', '未着手', 1),
  ('試験の申込', '未着手', '活→技　OKか確認する', 2),
  ('試験の申込', '進行中', 'アプリケーションNo.発行待ち', 1),
  ('試験の申込', '進行中', '１号試験の申込する', 2),
  ('試験の申込', '進行中', '１号農業試験の結果を確認する', 3),
  ('試験の申込', '進行中', '2号試験の申込する', 4),
  ('試験の申込', '進行中', '2号試験結果の確認をする', 5),
  ('試験の申込', '進行中', '主催団体確認中（メール確認する）', 6),
  ('試験の申込', '進行中', '特定技能問い合わせからの返信待ち', 7),
  ('試験の申込', '完了', '試験申込済！後日試験結果確認する', 1),
  ('試験の申込', '完了', '完了', 2),
  -- チェック（経過が「明菜　チェック中」「彩奈　チェック中」のときの確認ステータス）
  ('チェック', '未着手', '未着手', 1),
  ('チェック', '進行中', '進行中', 1),
  ('チェック', '進行中', '訂正したところを確認してください', 2),
  ('チェック', '完了', '担当者が確認しました', 1),
  ('チェック', '完了', '🥰訂正箇所ありませんでした', 2)
on conflict (kind, name) do nothing;
