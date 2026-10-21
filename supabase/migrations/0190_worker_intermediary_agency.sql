-- 外国人ごとの「取次機関」（0190）。
-- オンライン申請 2.38〜2.42「特定技能雇用契約 (14)取次機関」に入れる、在留資格認定証明書交付申請のときの
-- 国外の取次機関（送出機関など）の名称・法人番号・郵便番号・住所・電話番号。
-- 申請準備の「申請書に貼る情報をコピー」でその場で入力・保存する。何度実行しても安全。
alter table workers
  add column if not exists agency_name         text not null default '', -- 取次機関 氏名又は名称
  add column if not exists agency_corporate_no text not null default '', -- 取次機関 法人番号（無ければ空）
  add column if not exists agency_postal       text not null default '', -- 取次機関 郵便番号
  add column if not exists agency_address      text not null default '', -- 取次機関 住所
  add column if not exists agency_tel          text not null default ''; -- 取次機関 電話番号

comment on column workers.agency_name is '取次機関の氏名又は名称（オンライン申請 2.38。認定申請のとき）';
comment on column workers.agency_corporate_no is '取次機関の法人番号（オンライン申請 2.39）';
comment on column workers.agency_postal is '取次機関の郵便番号（オンライン申請 2.40）';
comment on column workers.agency_address is '取次機関の住所（オンライン申請 2.41）';
comment on column workers.agency_tel is '取次機関の電話番号（オンライン申請 2.42）';
