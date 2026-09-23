-- 申請後に入管へ郵送した記録（何を・いつ投函して・追跡番号は何か）。
-- TODO番号ごとの準備リストに配列で持たせる（[{ id, doc_ids, posted_on, tracking }]）。
-- 書類を分けて郵送したときは1回の投函ごとに1件、まとめて送ったときは1件に複数の書類を入れる。
-- 何度実行しても安全（if not exists）
alter table application_prep_checklists
  add column if not exists post_apply_mailings jsonb not null default '[]'::jsonb;

comment on column application_prep_checklists.post_apply_mailings is
  '申請後に入管へ郵送した記録（[{ id, doc_ids, posted_on, tracking }]）';
