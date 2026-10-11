-- 従業員ごとの「在留申請オンラインシステム」のログイン情報（利用者ID・パスワード）。
--
-- 申請取次を行う職員は各自の利用者IDでオンライン申請システムにログインする。
-- 誰のIDが何かをアプリで控えておき、登録支援機関の従業員の画面から見られる・コピーできるようにする。
-- 保存するときは前後の空白（全角の空白も）を取り除く（アプリ側で行う）。
-- 何度実行しても安全（if not exists）
alter table employees
  add column if not exists online_user_id  text not null default '',  -- 在留申請オンラインシステムの利用者ID
  add column if not exists online_password text not null default '';  -- 同パスワード
