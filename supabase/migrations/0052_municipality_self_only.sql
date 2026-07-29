-- 自治体マスタに転出届・住民票の「本人申請のみ」設定を追加。
-- 本人申請のみの自治体では、郵送請求ツールで代理人申請を選べないようにする。
alter table municipalities add column if not exists tenshutsu_self_only boolean not null default false;
alter table municipalities add column if not exists juminhyo_self_only boolean not null default false;
