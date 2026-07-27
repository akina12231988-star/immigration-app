-- 会社・機関マスタ: 「登録支援機関への申込書」の内容を保存する intake 列。
-- 会社の連絡先・保険/年金・職員数・直近3年の決算・日本人常勤職員・労災/雇用保険・
-- 宿泊住所・役員などをまとめて JSONB で持つ（lib/organization-intake.ts 参照）。
alter table organizations add column if not exists intake jsonb not null default '{}'::jsonb;
