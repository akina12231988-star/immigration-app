-- 申請後の郵送・タスクの各項目（書類・タスク）に付けるメモ。
-- 例：「現在発行手続き中との連絡あり」。1項目に何件でも追加できる。
-- キーは項目（書類は "doc:<書類ID>"、タスクは "task:<タスクID>"）、値はメモの配列
--   [{ "id": "...", "text": "...", "on": "YYYY-MM-DD", "by": "記入者" }]
alter table application_prep_checklists
  add column if not exists post_apply_notes jsonb not null default '{}'::jsonb;

comment on column application_prep_checklists.post_apply_notes is
  '申請後の郵送・タスクの項目ごとのメモ（キー: doc:<書類ID> / task:<タスクID>）';
