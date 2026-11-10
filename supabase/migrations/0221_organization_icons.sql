-- 所属機関のアイコン画像（ロゴマーク・代表者の顔写真）。
-- 一覧のカードと所属機関の画面に出す。画像は非公開バケット app-files（org-icons/）に置き、
-- ここには保存先だけを持つ（表示は署名付きURL）。
-- 何度実行しても安全（add column if not exists）。
alter table organizations add column if not exists logo_path text;
alter table organizations add column if not exists rep_photo_path text;
comment on column organizations.logo_path is 'ロゴマーク画像の保存先（app-files バケット org-icons/）';
comment on column organizations.rep_photo_path is '代表者の顔写真の保存先（app-files バケット org-icons/）';

notify pgrst, 'reload schema';
