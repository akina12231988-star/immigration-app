-- 申請準備のTODOで、ステータスが「必要な書類まち」のときに何の書類を待っているかを記入する欄。
-- TODO一覧・申請準備の詳細に出し、A4印刷（準備状況の詳細）のメモ欄にも自動で入れる。
-- 何度実行しても安全（if not exists）
alter table todos
  add column if not exists waiting_note text not null default '';

comment on column todos.waiting_note is '「必要な書類まち」のときに待っている書類の内容（例: 課税証明書・本人の署名）';
