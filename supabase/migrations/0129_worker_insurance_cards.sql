-- 保険証（健康保険）の記録。現在の保険証と、切り替わる前の履歴を残す。
--
-- 種類（国保・マイナ保険証・社保・その他）と画像・PDFを外国人ごとに記録する。
-- 新しく登録した行（created_at が最新）が「現在の保険証」、それより前は履歴。
-- 社保のときは、どの職歴（会社）の社保かを work_histories に紐付けられる。
-- 画像の実体は app-files バケット（insurance-cards/{worker_id}/...）に保存し、
-- ここにメタデータを持つ（パスポートの添付 0096 と同じ方式）。
create table if not exists worker_insurance_cards (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers(id) on delete cascade,
  kind            text not null default '',  -- 国保 / マイナ保険証 / 社保 / その他（'' = 未設定）
  kind_note       text not null default '',  -- その他のときの内容（自由入力）
  work_history_id uuid references work_histories(id) on delete set null, -- 社保のとき、どの職歴（会社）の社保か
  storage_path    text not null default '',  -- 画像・PDF（'' = 画像なしで種類だけ記録）
  file_name       text not null default '',
  mime_type       text not null default '',
  uploaded_by     uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_worker_insurance_cards_worker
  on worker_insurance_cards (worker_id, created_at desc);

alter table worker_insurance_cards enable row level security;

drop policy if exists sel_worker_insurance_cards on worker_insurance_cards;
create policy sel_worker_insurance_cards on worker_insurance_cards for select
  using (my_role() is not null);
drop policy if exists ins_worker_insurance_cards on worker_insurance_cards;
create policy ins_worker_insurance_cards on worker_insurance_cards for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_worker_insurance_cards on worker_insurance_cards;
create policy upd_worker_insurance_cards on worker_insurance_cards for update
  using (my_role() in ('admin', 'staff'));
drop policy if exists del_worker_insurance_cards on worker_insurance_cards;
create policy del_worker_insurance_cards on worker_insurance_cards for delete
  using (my_role() in ('admin', 'staff'));
