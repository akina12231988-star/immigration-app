-- 外国人ID（例: V-1）。国籍を表す英字1文字 + 連番。追加のみ。
alter table workers add column if not exists worker_code text;
create unique index if not exists idx_workers_code on workers (worker_code) where worker_code is not null;
