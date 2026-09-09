-- 自治体マスタに、その自治体のサイト（郵送請求の案内ページなど）のURLを追加。
-- 郵送請求の自治体マスタ・判定結果からそのまま開けるようにする。
alter table municipalities add column if not exists website_url text not null default '';
comment on column municipalities.website_url is '自治体のサイトのURL（郵送請求の案内ページなど。空は未登録）';
