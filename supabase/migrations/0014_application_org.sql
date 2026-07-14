-- 申請に所属機関を明示的に持たせる（要件③: 申請登録・一覧の所属機関）。
-- 既存の worker.current_organization_id とは別に、申請時点の所属機関を記録する。

alter table immigration_applications
  add column if not exists organization_id uuid references organizations (id) on delete set null;

create index if not exists idx_imm_apps_org on immigration_applications (organization_id);

-- 許可処理で「指定書」画像も登録できるよう、application_files.kind の制約に追加
alter table application_files drop constraint if exists application_files_kind_check;
alter table application_files
  add constraint application_files_kind_check
  check (kind in ('受付票', '通知書', '在留カード', '指定書', 'その他'));
