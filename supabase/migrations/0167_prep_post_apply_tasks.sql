-- 申請後に対応すること（入管へ郵送する書類のほかのタスク）。
-- TODO番号ごとの準備リストに、テキストのタスクを配列で持たせる（[{ id, text, done }]）。
-- 申請準備の「申請後に入管へ郵送するリスト」で入力し、申請一覧の「申請後の郵送・タスク」にまとめて出す。
-- 何度実行しても安全（if not exists）
alter table application_prep_checklists
  add column if not exists post_apply_tasks jsonb not null default '[]'::jsonb;

comment on column application_prep_checklists.post_apply_tasks is
  '申請後に対応するタスク（[{ id, text, done }]）。申請一覧の「申請後の郵送・タスク」に出す';
