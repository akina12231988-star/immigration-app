-- 職業紹介事業の訪問指導（監査）対応。
--
-- 労働局の確認書類「求人管理簿・求職管理簿・手数料管理簿」（厚労省様式）を
-- システムからそのままExcel出力できるよう、様式にあって未管理だった項目を足す。
-- あわせて、採用時の雇用契約書・雇用条件書を外国人の書類として紐づけられるようにする。

-- 求人管理簿: 求人受理番号（例: 6-1。労働局へ提出する様式30にも使う）
alter table job_postings
  add column if not exists acceptance_no text not null default '';
comment on column job_postings.acceptance_no is
  '求人受理番号（求人管理簿・求職管理簿・様式30で使用。例: 6-1）';

-- 求職管理簿: 求職受付の情報（1人1受付として外国人に持たせる）。
-- 希望職種は workers.field（特定産業分野・職種）を使うため列は増やさない
alter table workers
  add column if not exists jobseeker_no text not null default '',
  add column if not exists jobseeker_accepted_on date,
  add column if not exists jobseeker_valid_until date;
comment on column workers.jobseeker_no is '求職受付番号（求職管理簿。例: R8KS-2）';
comment on column workers.jobseeker_accepted_on is '求職受付年月日（未入力なら最初の応募日で代用して出力）';
comment on column workers.jobseeker_valid_until is '求職の有効期間（終了日）';

-- 求人管理簿・求職管理簿: 採用後の記載事項。
-- 転職勧奨禁止期間（採用日から2年）は採用年月日から計算するため列は持たない
alter table job_applications
  add column if not exists employment_term text not null default '',        -- 雇用期間（'' / 無期 / 有期）
  add column if not exists separation_status text not null default '',      -- 6か月以内の離職状況（'' / 離職 / 離職せず / 不明）
  add column if not exists separation_checked_on date,                      -- 離職状況の調査日
  add column if not exists separation_check_method text not null default ''; -- 調査方法（例: 電話確認）

-- 手数料管理簿: 手数料の種類と算出根拠（賃金、割合等）
alter table referral_fees
  add column if not exists fee_kind text not null default '紹介手数料',
  add column if not exists calc_basis text not null default '';
comment on column referral_fees.fee_kind is '手数料の種類（手数料管理簿。例: 紹介手数料 / 求人受付手数料）';
comment on column referral_fees.calc_basis is '手数料の算出根拠（手数料管理簿。例: 賃金総額150万円×11％）';

-- 雇用契約書・雇用条件書を外国人の書類（worker_documents）として登録できるようにする
alter table worker_documents drop constraint if exists worker_documents_kind_check;
alter table worker_documents add constraint worker_documents_kind_check
  check (kind in ('在留カード', '指定書', '雇用契約書', '雇用条件書'));
