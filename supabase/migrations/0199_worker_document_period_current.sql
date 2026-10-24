-- 在留カード・指定書の「追加した期間」のうち、どれが「現在」の期間かを選べるようにする（0197 の追加）。
--
-- 「現在」にした期間は「現在」のタブにまとまり（その期間のタブは別に出ない）、
-- 「現在」で登録した画像はその期間に結び付く。新しい在留カードが来たら新しい期間を追加して
-- 「現在」にすれば、前の期間は画像ごと過去のタブになる。1人につき現在の期間は1つ。
-- 何度実行しても安全（add column if not exists）。
alter table worker_document_periods
  add column if not exists is_current boolean not null default false;
comment on column worker_document_periods.is_current is 'この期間を「現在」のタブにする（1人につき1つ）';
