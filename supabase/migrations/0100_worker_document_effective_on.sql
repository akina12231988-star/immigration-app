-- 在留カード・指定書などの書類に「いつ時点の書類か」を記録する日付を追加する。
-- 過去の在籍期間タブから当時の画像を登録するとき、登録日ではなくこの日付で期間に振り分ける。
-- 何度実行しても安全（if not exists）

alter table public.worker_documents
  add column if not exists effective_on date;

comment on column public.worker_documents.effective_on is
  'この書類がいつ時点のものか（過去の在籍期間への登録用）。null なら登録日で判定する';
