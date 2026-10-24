-- 外国人詳細の在留カード・指定書で、在籍期間のタブにない期間を自分で追加できるようにする（0197）。
--
-- これまでタブは職歴の在籍期間から自動で作っていたため、
-- 「前の会社を辞めたあとの在留カード（例: 2025-11-11〜2026-11-11）→ 次に現在」のような、
-- どの在籍期間にも当たらない期間の在留カード・照合結果・指定書を登録する場所が無かった。
-- 期間（名前・開始日・終了日）をこの表に登録するとタブが増え、そのタブで登録した画像は
-- worker_documents.period_id でその期間に結び付く（日付ではなく期間IDで振り分ける）。
-- 何度実行しても安全（if not exists）。
create table if not exists worker_document_periods (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references workers (id) on delete cascade,
  label      text not null default '',  -- 期間の名前（所属機関名・「在留カード更新前」など。空でもよい）
  start_on   date not null,             -- 開始日（在留カードの交付日など）
  end_on     date,                      -- 終了日（未定なら空）
  created_at timestamptz not null default now()
);
create index if not exists idx_worker_document_periods_worker
  on worker_document_periods (worker_id, start_on desc);

alter table worker_document_periods enable row level security;
drop policy if exists sel_worker_document_periods on worker_document_periods;
create policy sel_worker_document_periods on worker_document_periods for select
  using (my_role() is not null);
drop policy if exists ins_worker_document_periods on worker_document_periods;
create policy ins_worker_document_periods on worker_document_periods for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_worker_document_periods on worker_document_periods;
create policy upd_worker_document_periods on worker_document_periods for update
  using (my_role() in ('admin', 'staff'));
drop policy if exists del_worker_document_periods on worker_document_periods;
create policy del_worker_document_periods on worker_document_periods for delete
  using (my_role() in ('admin', 'staff'));

-- 画像がどの追加期間のものか。期間を削除しても画像は残り（set null）、日付で元の振り分けに戻る
alter table worker_documents
  add column if not exists period_id uuid references worker_document_periods (id) on delete set null;
comment on column worker_documents.period_id is '追加した期間（worker_document_periods）のID。無ければ日付で在籍期間に振り分ける';
