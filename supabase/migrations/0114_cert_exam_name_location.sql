-- 日本語の合格証・専門外の合格証: 受験した試験名・受験地を記録できるようにする。
-- 名前はよくある候補から選ぶか自由入力、受験地は「日本国内」か海外の国名を選べる（外国人詳細）。
alter table workers add column if not exists cert_nihongo_name text not null default '';
alter table workers add column if not exists cert_nihongo_location text not null default '';
alter table workers add column if not exists cert_senmongai_name text not null default '';
alter table workers add column if not exists cert_senmongai_location text not null default '';
