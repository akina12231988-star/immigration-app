-- 特定技能総合保険の管理（TODO ＞ 特定技能総合保険）。
--
-- ・未加入の人、期限切れ（まもなく期限）の人を一覧にする
-- ・所属機関が外国人負担のときは、本人の意思確認の結果（加入する／加入しない）を残す
-- ・加入手続き・解約手続きのTODOを作る（todos.kind に「特定技能総合保険」を追加）
-- ・加入したら被保険者証明書（画像・PDF）を貼り付け、証明書番号と有効期限を記録する
--
-- 何度実行しても安全（if not exists / drop ... if exists / on conflict do nothing）。

-- 被保険者証明書の番号と、意思確認の結果を workers に追加（追加のみ）
alter table workers
  -- 被保険者証明書の番号（証明書に書かれている番号）
  add column if not exists ssw_insurance_no text not null default '',
  -- 意思確認をして「加入しない」と判断した（外国人負担で本人が希望しない場合）
  add column if not exists ssw_insurance_declined boolean not null default false,
  -- 「加入しない」と判断した日（意思確認をした日）
  add column if not exists ssw_insurance_declined_on date,
  -- 意思確認の内容・引き継ぎのメモ
  add column if not exists ssw_insurance_note text not null default '';

-- 被保険者証明書の記録。新しく登録した行（created_at が最新）が現在の証明書で、
-- それより前は履歴として残る。画像・PDFの実体は app-files バケット
-- （ssw-insurance/{worker_id}/...）に置き、ここにメタデータを持つ（0129 と同じ方式）。
create table if not exists worker_ssw_insurance_certs (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references workers(id) on delete cascade,
  cert_no      text not null default '',  -- 被保険者証明書の番号
  expiry_date  date,                      -- 有効期限
  storage_path text not null default '',  -- 画像・PDF（'' = ファイルなしで番号だけ記録）
  file_name    text not null default '',
  mime_type    text not null default '',
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_worker_ssw_insurance_certs_worker
  on worker_ssw_insurance_certs (worker_id, created_at desc);

alter table worker_ssw_insurance_certs enable row level security;

drop policy if exists sel_worker_ssw_insurance_certs on worker_ssw_insurance_certs;
create policy sel_worker_ssw_insurance_certs on worker_ssw_insurance_certs for select
  using (my_role() is not null);
drop policy if exists ins_worker_ssw_insurance_certs on worker_ssw_insurance_certs;
create policy ins_worker_ssw_insurance_certs on worker_ssw_insurance_certs for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_worker_ssw_insurance_certs on worker_ssw_insurance_certs;
create policy upd_worker_ssw_insurance_certs on worker_ssw_insurance_certs for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_worker_ssw_insurance_certs on worker_ssw_insurance_certs;
create policy del_worker_ssw_insurance_certs on worker_ssw_insurance_certs for delete
  using (my_role() in ('admin', 'staff'));

-- TODOの構成に「特定技能総合保険」を追加（加入手続き・解約手続きのTODO）
alter table todos drop constraint if exists todos_kind_check;
alter table todos add constraint todos_kind_check
  check (kind in ('申請準備', '退職の随時報告書', '試験の申込', '特定技能総合保険'));

alter table todo_status_options drop constraint if exists todo_status_options_kind_check;
alter table todo_status_options add constraint todo_status_options_kind_check
  check (kind in ('申請準備', '退職の随時報告書', '試験の申込', 'チェック', '特定技能総合保険'));

-- 特定技能総合保険のTODOの経過（未着手 → 申込手続中 → 完了の3つ）
insert into todo_status_options (kind, stage, name, sort_no) values
  ('特定技能総合保険', '未着手', '未着手', 1),
  ('特定技能総合保険', '進行中', '申込手続中', 1),
  ('特定技能総合保険', '完了', '完了', 1)
on conflict (kind, name) do nothing;
