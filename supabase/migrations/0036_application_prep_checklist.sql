-- 申請準備の書類チェックリストのメタ情報（外国人1人につき1件）。
-- 各書類のファイル自体は onboarding_documents（prep_* / cert_* / gensen_r* / kenshin）
-- や workers.photo_path など既存の保存先を参照し、ここには申請種別・条件などのみ持つ。
create table if not exists application_prep_checklists (
  worker_id        uuid primary key references workers (id) on delete cascade,
  app_type         text not null default '' check (app_type in ('', '変更', '更新')),
  has_kokuho       boolean not null default false, -- 国民健康保険に加入
  has_nenkin       boolean not null default false, -- 国民年金に加入
  target_reiwa     integer,                        -- 対象年度（令和・源泉徴収票/課税/納税用）
  kenshin_items_ok boolean not null default false, -- 健康診断書の受診項目を確認済み
  updated_at       timestamptz not null default now()
);

alter table application_prep_checklists enable row level security;

-- 閲覧は全ロール、追加・更新は admin/staff（他テーブルと同方針）
create policy sel_prep_checklist on application_prep_checklists for select
  using (my_role() is not null);
create policy ins_prep_checklist on application_prep_checklists for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_prep_checklist on application_prep_checklists for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));

create trigger application_prep_checklists_updated before update on application_prep_checklists
  for each row execute procedure moddatetime(updated_at);
