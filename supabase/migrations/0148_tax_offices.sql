-- 税務署マスタ（納税証明書その3の郵送請求先）。
-- 外国人の現在の住所から管轄の税務署を出すために、管轄区域（市区町村名）を持つ。
-- 郵送請求の記録（judgment_records.data）には taxOfficeId / taxOfficeName で紐づける。
create table if not exists tax_offices (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                 -- 例: 熊本東税務署
  prefecture   text not null default '',      -- 都道府県（一覧のまとまりに使う）
  postal_code  text not null default '',      -- 郵便番号（例: 862-8686）
  address      text not null default '',      -- 所在地（郵送先）
  phone        text not null default '',
  jurisdiction text not null default '',      -- 管轄区域。市区町村名を「、」区切り（例: 熊本市東区、上益城郡益城町）
  website_url  text not null default '',      -- 国税庁の税務署案内ページなど
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists idx_tax_offices_name on tax_offices (name);

alter table tax_offices enable row level security;

-- municipalities と同じ権限（閲覧: ログイン者全員 / 追加・更新・削除: admin・staff）
drop policy if exists sel_tax_offices on tax_offices;
drop policy if exists ins_tax_offices on tax_offices;
drop policy if exists upd_tax_offices on tax_offices;
drop policy if exists del_tax_offices on tax_offices;
create policy sel_tax_offices on tax_offices for select using (my_role() is not null);
create policy ins_tax_offices on tax_offices for insert with check (my_role() in ('admin', 'staff'));
create policy upd_tax_offices on tax_offices for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_tax_offices on tax_offices for delete using (my_role() in ('admin', 'staff'));

drop trigger if exists tax_offices_updated on tax_offices;
create trigger tax_offices_updated before update on tax_offices
  for each row execute procedure moddatetime(updated_at);

-- 熊本県の税務署（熊本国税局）の初期データ。管轄区域は市区町村名で持つ。
-- 所在地・郵便番号・電話は国税庁の税務署案内で確認してから画面（税務署マスタ）で入れる。
-- ※ 同じ名前がすでにあれば何もしない（何度流しても増えない）
insert into tax_offices (name, prefecture, postal_code, address, jurisdiction, website_url)
select v.name, v.prefecture, v.postal_code, v.address, v.jurisdiction, v.website_url
from (values
  ('熊本西税務署', '熊本県', '860-8621', '熊本県熊本市西区春日2丁目10番1号 熊本地方合同庁舎A棟',
   '熊本市中央区、熊本市西区、熊本市南区、熊本市北区',
   'https://www.nta.go.jp/about/organization/kumamoto/location/kumamoto.htm'),
  ('熊本東税務署', '熊本県', '862-8686', '熊本県熊本市東区東町4丁目14番35号',
   '熊本市東区、上益城郡御船町、上益城郡嘉島町、上益城郡益城町、上益城郡甲佐町、上益城郡山都町',
   'https://www.nta.go.jp/about/organization/kumamoto/location/kumamoto.htm'),
  ('八代税務署', '熊本県', '', '',
   '八代市、水俣市、八代郡氷川町、葦北郡芦北町、葦北郡津奈木町',
   'https://www.nta.go.jp/about/organization/kumamoto/location/kumamoto.htm'),
  ('人吉税務署', '熊本県', '', '',
   '人吉市、球磨郡錦町、球磨郡多良木町、球磨郡湯前町、球磨郡水上村、球磨郡相良村、球磨郡五木村、球磨郡山江村、球磨郡球磨村、球磨郡あさぎり町',
   'https://www.nta.go.jp/about/organization/kumamoto/location/kumamoto.htm'),
  ('玉名税務署', '熊本県', '', '',
   '玉名市、荒尾市、玉名郡玉東町、玉名郡南関町、玉名郡長洲町、玉名郡和水町',
   'https://www.nta.go.jp/about/organization/kumamoto/location/kumamoto.htm'),
  ('山鹿税務署', '熊本県', '', '',
   '山鹿市',
   'https://www.nta.go.jp/about/organization/kumamoto/location/kumamoto.htm'),
  ('菊池税務署', '熊本県', '', '',
   '菊池市、合志市、菊池郡大津町、菊池郡菊陽町',
   'https://www.nta.go.jp/about/organization/kumamoto/location/kumamoto.htm'),
  ('阿蘇税務署', '熊本県', '', '',
   '阿蘇市、阿蘇郡南小国町、阿蘇郡小国町、阿蘇郡産山村、阿蘇郡高森町、阿蘇郡西原村、阿蘇郡南阿蘇村',
   'https://www.nta.go.jp/about/organization/kumamoto/location/kumamoto.htm'),
  ('宇土税務署', '熊本県', '', '',
   '宇土市、宇城市、下益城郡美里町',
   'https://www.nta.go.jp/about/organization/kumamoto/location/kumamoto.htm'),
  ('天草税務署', '熊本県', '', '',
   '天草市、上天草市、天草郡苓北町',
   'https://www.nta.go.jp/about/organization/kumamoto/location/kumamoto.htm')
) as v(name, prefecture, postal_code, address, jurisdiction, website_url)
where not exists (select 1 from tax_offices t where t.name = v.name);
