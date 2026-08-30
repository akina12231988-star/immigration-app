-- 外国人ごとの資料ファイル（Google Drive のフォルダ・ファイルなど）へのリンク。
--
-- 詳細ページの上部（名前の下）に Messenger・Notion と並べてボタンで出し、
-- その人の書類フォルダなどをすぐ開けるようにする。
--
-- 何度実行しても安全です（if not exists）。
alter table workers
  add column if not exists file_link text not null default '';

comment on column workers.file_link is
  '資料ファイル（Google Drive のフォルダ・ファイルなど）へのリンク。空欄 = 未登録';
