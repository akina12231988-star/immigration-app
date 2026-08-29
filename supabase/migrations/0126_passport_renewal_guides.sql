-- パスポート更新案内の進捗（外国人ごとに1件）。
-- 「パスポート更新必要」一覧で、案内した日を記録する。
-- 案内のスクショ・新しいパスポートの画像は worker_passport_files（0096）に
-- kind を分けて保存するので、このテーブルは日付の記録だけ。
-- guided_expiry には案内したときの有効期限を控える。パスポートが更新されて
-- 有効期限が変わったら、次の更新時期にはまた「未案内」から始まる。
-- すべて冪等（何度実行してもエラーにならない）。
create table if not exists passport_renewal_guides (
  worker_id     uuid primary key references workers (id) on delete cascade,
  guided_on     date,          -- 案内した日（null=未案内）
  guided_expiry date,          -- 案内したときのパスポート有効期限（控え）
  updated_at    timestamptz not null default now()
);

alter table passport_renewal_guides enable row level security;

drop policy if exists sel_passport_renewal_guides on passport_renewal_guides;
create policy sel_passport_renewal_guides on passport_renewal_guides for select
  using (my_role() is not null);
drop policy if exists ins_passport_renewal_guides on passport_renewal_guides;
create policy ins_passport_renewal_guides on passport_renewal_guides for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_passport_renewal_guides on passport_renewal_guides;
create policy upd_passport_renewal_guides on passport_renewal_guides for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_passport_renewal_guides on passport_renewal_guides;
create policy del_passport_renewal_guides on passport_renewal_guides for delete
  using (my_role() in ('admin', 'staff'));

drop trigger if exists passport_renewal_guides_updated on passport_renewal_guides;
create trigger passport_renewal_guides_updated before update on passport_renewal_guides
  for each row execute procedure moddatetime(updated_at);
