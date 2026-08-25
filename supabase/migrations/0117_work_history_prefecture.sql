-- 職歴に「都道府県」を記録できるようにする。
-- 労働者名簿の「前職」欄は会社名と都道府県の2列なので、職歴に都道府県を入れておくと
-- 名簿を作るときに自動で転記できる（worker_rosters.previous_jobs の prefecture）。
alter table work_histories add column if not exists prefecture text not null default '';
