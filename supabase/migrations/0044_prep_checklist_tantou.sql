-- 申請準備チェックリストに担当者（社内スタッフ）を追加。
-- TODO番号ごとのリストに紐づき、申請準備（外国人詳細・申請一覧のモーダル）と
-- 申請一覧「申請前＜準備中＞」の両方から設定・変更できる。未定の間は空文字。
alter table application_prep_checklists add column if not exists tantou text not null default '';
