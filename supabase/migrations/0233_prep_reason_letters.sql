-- 申請準備の提出書類一覧表で作る「理由書」（書類を出せない・遅れる理由などを書いて申請に添える）。
-- 画面で題名・宛先・日付・本文と、最後に入れる項目（申請人の氏名・国籍・生年月日・署名欄、登録支援機関の名称）を選んで作り、
-- PDF はその行に添付する。書いた内容はここに残し、次の人で同じ書類の理由書を作るときに候補として出す。
--
-- prep_reason_letters … 外国人 × 申請準備のTODO番号 × 提出書類一覧表の行ごとに1件
--   row_key  … 提出書類一覧表の行のキー（例: t1-9）。候補は1号のキーにそろえた form_key で探す
--   form_key … 行のキーを1号のキーにそろえたもの（2号の同じ書類の理由書も候補に出す）
--   title・addressee・letter_date・body … 題名・宛先・日付（表示する文字）・本文
--   options  … 最後に入れる項目 { name, nationality, birth, sign, supportOrg }（true/false）
-- 何度実行しても安全。

create table if not exists prep_reason_letters (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references workers (id) on delete cascade,
  todo_no     text not null default '',
  row_key     text not null,
  form_key    text not null,
  title       text not null default '理由書',
  addressee   text not null default '',
  letter_date text not null default '',
  body        text not null default '',
  options     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (worker_id, todo_no, row_key)
);

create index if not exists prep_reason_letters_form_key on prep_reason_letters (form_key, updated_at desc);

alter table prep_reason_letters enable row level security;

-- 閲覧: ログイン者全員 / 追加・更新・削除: admin・staff
drop policy if exists sel_prep_reason_letters on prep_reason_letters;
drop policy if exists ins_prep_reason_letters on prep_reason_letters;
drop policy if exists upd_prep_reason_letters on prep_reason_letters;
drop policy if exists del_prep_reason_letters on prep_reason_letters;
create policy sel_prep_reason_letters on prep_reason_letters for select using (my_role() is not null);
create policy ins_prep_reason_letters on prep_reason_letters for insert with check (my_role() in ('admin', 'staff'));
create policy upd_prep_reason_letters on prep_reason_letters for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_prep_reason_letters on prep_reason_letters for delete using (my_role() in ('admin', 'staff'));

drop trigger if exists prep_reason_letters_updated on prep_reason_letters;
create trigger prep_reason_letters_updated before update on prep_reason_letters
  for each row execute procedure moddatetime(updated_at);

notify pgrst, 'reload schema';
