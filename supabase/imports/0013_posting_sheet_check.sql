-- 求人票（特定技能1号）の内容の取り込み【その1: 確認だけ】
--
-- Notion の求人管理簿（令和8年度・R8KJN-◯◯）に入力してもらった求人票の内容を、
-- 求人詳細の「求人票（特定技能1号）」欄（job_postings.sheet）に入れる前の確認です。
-- このSQLはデータを変えません（select だけ）。結果を見てから
-- 0014_posting_sheet_import.sql を実行してください。
--
-- 先に 0090_job_posting_sheet.sql（sheet 列の追加）が実行済みである必要があります。
-- 「destructive operations」と出たら「Run without RLS」で実行してください
--   （消しているのは、この接続の中だけで使う作業用の一時表 imp_sheet だけです）。

drop table if exists imp_sheet;

create temp table imp_sheet (
  acceptance_no text,   -- 求人受理番号（R8KJN-◯◯）
  employer      text,   -- 求人者名（確認用。突き合わせには使いません）
  sheet         jsonb,  -- 求人票の内容（job_postings.sheet に入れるもの）
  contact       text,   -- 電話番号
  work_location text,   -- 勤務地
  job_type      text,   -- 職種
  wage_kind     text,   -- 給与形態
  wage_amount   int     -- 基本給
);
insert into imp_sheet values
  ('R8KJN-18', '井上 雅夫', '{"filled_on": "2026-05-01", "field_name": "農業", "job_description": "トマトや野菜の収穫と栽培", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "7時間30分", "flexible_hours": "1年単位の変形労働制", "break_minutes": "90", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日（他企業指定日）77日", "deduction_items": ["水道光熱費", "社宅（居住費）", "通信費", "雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "pay_closing_day": "末日", "pay_day": "25日", "pay_method": "口座振込", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"]}'::jsonb, '0965-37-0545', '熊本県八代市郡築十一番町115-2', '耕種農業', '時給', 1060),
  ('R8KJN-9', '井上雅夫', '{"filled_on": "2026-04-01", "field_name": "農業", "job_description": "野菜の収穫と栽培", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "7時間30分", "flexible_hours": "1年単位の変形労働制", "break_minutes": "90", "overtime": "有", "holiday_note": "年間カレンダーのとおり", "deduction_items": ["水道光熱費", "社宅（居住費）", "通信費", "雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "pay_closing_day": "末日", "pay_day": "25日", "pay_method": "口座振込", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"], "smoking": "屋内禁煙"}'::jsonb, '0965-37-0545', '熊本県八代市郡築十一番町115-2', '耕種農業', '時給', 1060),
  ('R8KJN-15', '井上 洋介', '{"filled_on": "2026-06-01", "field_name": "農業", "job_description": "トマトの栽培と収穫", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "7時間30分", "flexible_hours": "1年単位の変形労働制", "break_minutes": "90", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日、年間カレンダーのとおり", "deduction_items": ["水道光熱費", "社宅（居住費）", "雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "pay_closing_day": "末日", "pay_day": "25日", "pay_method": "通貨払い", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"]}'::jsonb, '0965-37-0553', '〒866-0002 熊本県八代市郡築十一番町79-2', 'トマトの栽培と収穫', '時給', 1050),
  ('R8KJN-6', '稲田 哲也', '{"filled_on": "2026-04-01", "field_name": "農業", "job_description": "オクラなどの野菜栽培や収穫", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "16:30", "daily_hours": "7時間", "flexible_hours": "なし", "break_minutes": "90", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日（その他；企業指定）", "social_insurance": "適用なし", "employment_insurance": "適用なし", "raise": "無", "bonus": "無", "pay_closing_day": "毎月末日", "pay_day": "毎月10日", "pay_method": "口座振込", "insurances": ["国民健康保険", "国民年金"], "insurance_other": "共栄火災海上保険の業務災害補償保険", "smoking": "屋内原則禁煙（喫煙室あり）"}'::jsonb, '0965-37-0230', '熊本県八代市郡築６番町35-2', '耕種農業', '月給', 196000),
  ('R8KJN-8', '岩下 みちる', '{"filled_on": "2026-04-02", "field_name": "農業", "job_description": "野菜の栽培と収穫", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "7時間30分", "flexible_hours": "1年単位の変形労働制", "break_minutes": "90", "overtime": "有", "holiday_note": "年間カレンダーのとおり", "deduction_items": ["水道光熱費", "社宅（居住費）", "雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "pay_closing_day": "毎月末日", "pay_day": "毎月25日", "pay_method": "口座振込", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"], "smoking": "屋内禁煙"}'::jsonb, '0965-37-0826', '熊本県八代市郡築十二番町29-2', '耕種農業', '時給', 1050),
  ('R8KJN-4', '岩崎恭志', '{"filled_on": "2026-04-01", "field_name": "農業", "job_description": "ブロッコリーの収穫と栽培", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "8時間", "flexible_hours": "なし", "break_minutes": "90", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週 日曜日，その他（企業指定日）", "deduction_items": ["水道光熱費", "社宅（居住費）", "通信費"], "social_insurance": "適用なし", "employment_insurance": "適用なし", "pay_closing_day": "毎月末日", "pay_day": "毎月10日", "pay_method": "口座振込", "insurances": ["国民健康保険", "国民年金"], "insurance_other": "農協の農作業中傷害共済保険", "smoking": "敷地内禁煙"}'::jsonb, '090-1169-6043', '〒866-0824 熊本県八代市上日置町４２６４−３', '農業', '月給', 180000),
  ('R8KJN-25', '高濱 拓己', '{"filled_on": "2026-05-25", "field_name": "農業", "job_description": "野菜の収穫と栽培", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "8時間", "flexible_hours": "なし", "break_minutes": "60", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日（他企業指定日）", "deduction_items": ["水道光熱費", "社宅（居住費）", "通信費", "雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "pay_closing_day": "末日", "pay_day": "1日", "pay_method": "通貨払い", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"]}'::jsonb, '0965-37-2245', '熊本県八代市昭和同仁町338番地202', '野菜の収穫と栽培', '時給', 1070),
  ('R8KJN-11', '三山 圭史', '{"filled_on": "2026-04-13", "field_name": "農業", "job_description": "野菜の栽培と採取", "contract_term_kind": "期間の定めあり", "work_start": "7:30", "work_end": "17:00", "daily_hours": "8時間", "flexible_hours": "なし", "break_minutes": "90", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日（他企業指定日）", "deduction_items": ["水道光熱費", "社宅（居住費）", "雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "pay_closing_day": "末日締", "pay_day": "毎月25日", "pay_method": "通貨払い", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"], "smoking": "屋内禁煙"}'::jsonb, '0965-62-9420', '熊本県八代市郡築十番町172-2', '耕種農業', '時給', 1050),
  ('R8KJN-14', '西田 博幸', '{"filled_on": "2026-05-22", "field_name": "農業", "job_description": "いちごの収穫と栽培", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "8時間", "flexible_hours": "なし", "break_minutes": "60", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日（他企業指定日）", "deduction_items": ["水道光熱費", "社宅（居住費）"], "social_insurance": "適用なし", "employment_insurance": "適用なし", "pay_closing_day": "末日締", "pay_day": "25日", "pay_method": "通貨払い", "insurances": ["労災保険", "国民健康保険", "国民年金"]}'::jsonb, '0965-52-7167', '〒869-4801 熊本県八代郡氷川町新田681', '耕種農業', '時給', 1060),
  ('R8KJN-17', '西田 博幸', '{"filled_on": "2026-05-01", "field_name": "農業", "job_description": "いちごの収穫と栽培", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "8時間", "flexible_hours": "なし", "break_minutes": "60", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日（他企業指定日）", "deduction_items": ["水道光熱費", "社宅（居住費）"], "social_insurance": "適用なし", "employment_insurance": "適用なし", "pay_closing_day": "末日", "pay_day": "25日", "pay_method": "通貨払い", "insurances": ["労災保険", "国民健康保険", "国民年金"]}'::jsonb, '0965-52-7167', '熊本県八代郡氷川町新田681', 'いちご', '時給', 1060),
  ('R8KJN-16', '西田 祐一', '{"filled_on": "2026-05-01", "field_name": "農業", "job_description": "オクラ・ブロッコリーなどの野菜の収穫と栽培", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "8時間", "flexible_hours": "１ヶ月単位の変形労働制", "break_minutes": "60", "overtime": "有", "holiday_note": "週2日", "social_insurance": "適用なし", "employment_insurance": "適用なし"}'::jsonb, '0965-46-0348', '〒869-4702 熊本県八代市千丁町吉王丸1426', '耕種農業', '月給', 185500),
  ('R8KJN-7', '藤本 未和', '{"filled_on": "2026-04-10", "field_name": "農業", "job_description": "にんじんや野菜の収穫、栽培、梱包", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "8時間", "flexible_hours": "1年単位の変形労働制", "break_minutes": "60", "overtime": "有", "holiday_note": "年間カレンダーの通り（105日）", "deduction_items": ["水道光熱費", "社宅（居住費）", "通信費", "雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "pay_closing_day": "末日締", "pay_day": "15日", "pay_method": "口座振込", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"], "smoking": "屋内原則禁煙（喫煙室あり）"}'::jsonb, '096-279-3534', '熊本県阿蘇郡西原村大字小森383番地', '耕種農業', '時給', 1034),
  ('R8KJN-10', '片山 大輔', '{"filled_on": "2026-04-13", "field_name": "農業", "job_description": "野菜の収穫や栽培", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "7時間30分", "flexible_hours": "なし", "break_minutes": "90", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日、その他企業指定日", "deduction_items": ["水道光熱費", "社宅（居住費）", "雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "pay_closing_day": "末日締め", "pay_day": "5日", "pay_method": "口座振込", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"], "smoking": "屋内禁煙"}'::jsonb, '0965-37-0107', '熊本県八代市郡築一番町298-2', '耕種農業', '時給', 1070),
  ('R8KJN-13', '有限会社徳永蒲鉾店', '{"filled_on": "2026-04-05", "field_name": "飲食料品製造業", "job_description": "蒲鉾の製造業", "contract_term_kind": "期間の定めあり", "work_start": "5:00", "work_end": "14:00", "daily_hours": "8時間", "flexible_hours": "なし", "break_minutes": "60", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日（他、企業指定日）", "deduction_items": ["水道光熱費", "社会保険料", "社宅（居住費）", "雇用保険料"], "social_insurance": "適用", "employment_insurance": "適用", "pay_closing_day": "末日締", "pay_day": "毎月3日", "pay_method": "通貨払い", "insurances": ["健康保険", "労災保険", "厚生年金保険", "雇用保険"], "smoking": "屋内禁煙"}'::jsonb, '0968-78-0007', '熊本県玉名郡長洲町大字長洲833-1-1', '食品製造業', '時給', 1050),
  ('R8KJN-3', '有限会社國崎青果', '{"filled_on": "2026-04-01", "field_name": "農業", "job_description": "ブロッコリーなどの野菜の収穫と出荷作業", "contract_term_kind": "期間の定めあり", "work_start": "8:00/13:00", "work_end": "17:00/22:00", "daily_hours": "7時間30分", "flexible_hours": "なし", "break_minutes": "90", "overtime": "有", "holiday_note": "毎週 2 日，その他（シフト制により２日 ）", "allowances": [{"name": "", "amount": "", "method": "運転免許証を所持している場合は運転手当あり"}], "deduction_items": ["水道光熱費", "社会保険料", "社宅（居住費）", "雇用保険料"], "social_insurance": "適用", "employment_insurance": "適用", "pay_closing_day": "毎月10日", "pay_day": "毎月末日", "pay_method": "口座振込", "insurances": ["健康保険", "労災保険", "厚生年金保険", "雇用保険"], "smoking": "敷地内禁煙"}'::jsonb, '0965-32-5337', '季節に応じて、各地に行く', '', '時給', 1050),
  ('R8KJN-20', '大家 聖矢', '{"filled_on": "2026-07-05", "field_name": "農業", "job_description": "キャベツなどの野菜の収穫", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "7時間30分", "flexible_hours": "1年単位の変形労働制", "break_minutes": "90", "overtime": "有", "holiday_note": "年間カレンダーの通り", "deduction_items": ["水道光熱費", "社宅（居住費）", "雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "raise": "無", "pay_closing_day": "末日締", "pay_day": "毎月25日", "pay_method": "口座振込", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"], "smoking": "屋内禁煙"}'::jsonb, '0968-51-3453', '熊本県玉名市横島町共栄61', '耕種農業', '時給', 1042),
  ('R8KJN-19', '藤吉 淳', '{"filled_on": "2026-05-29", "field_name": "農業", "job_description": "ブロッコリーなどの野菜の栽培と収穫", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "8時間", "flexible_hours": "なし", "break_minutes": "90", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日（他、企業指定日）", "deduction_items": ["水道光熱費", "社宅（居住費）", "通信費", "雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "raise": "無", "pay_closing_day": "末日締", "pay_day": "毎月10日", "pay_method": "口座振込", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"], "smoking": "屋内禁煙"}'::jsonb, '0965-37-0901', '熊本県八代市郡築三番町１７５の２', '耕種農業', '時給', 1050),
  ('R8KJN-22', '宮本 浩光', '{"filled_on": "2026-05-29", "field_name": "農業", "job_description": "トマト・花の収穫及び管理作業", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "7時間30分", "flexible_hours": "なし", "break_minutes": "90", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日（他、企業指定日）", "deduction_items": ["水道光熱費", "社宅（居住費）", "通信費", "雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "raise": "無", "pay_closing_day": "末日締", "pay_day": "毎月10日", "pay_method": "口座振込", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"]}'::jsonb, '0965-52-3133', '熊本県八代市鏡町宝出296', '耕種農業', '時給', 1050),
  ('R8KJN-12', 'BASE株式会社', '{"filled_on": "2026-04-27", "field_name": "農業", "job_description": "野菜の栽培と収穫", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "7時間30分", "flexible_hours": "１ヶ月単位の変形労働制", "break_minutes": "90", "overtime": "有", "holiday_note": "月 ７〜8日", "social_insurance": "適用なし", "employment_insurance": "適用なし"}'::jsonb, '', '', '耕種農業', '', null),
  ('R8KJN-21', '三山 圭史', '{"filled_on": "2026-05-29", "field_name": "農業", "contract_term_kind": "期間の定めあり", "work_start": "8:00", "work_end": "17:00", "daily_hours": "7時間30分", "flexible_hours": "なし", "break_minutes": "90", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日（他、企業指定日）", "deduction_items": ["雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "raise": "無", "pay_closing_day": "末日締", "pay_day": "毎月10日", "pay_method": "口座振込", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"], "smoking": "屋内禁煙"}'::jsonb, '0965-62-9420', '熊本県八代市郡築十番町172-2', '耕種農業', '時給', 1050),
  ('R8KJN-2', '高濱伸吉', '{"filled_on": "2026-04-01", "field_name": "農業", "job_description": "トマトの収穫と出荷作業", "contract_term_kind": "期間の定めあり", "work_start": "7:30", "work_end": "17:00", "daily_hours": "8時間", "flexible_hours": "なし", "break_minutes": "90", "overtime": "有", "holidays": ["日"], "holiday_note": "毎週日曜日（  企業指定日  ）", "deduction_items": ["雇用保険料"], "social_insurance": "適用なし", "employment_insurance": "適用", "pay_closing_day": "毎月末締め", "pay_day": "毎月５日", "pay_method": "通貨払い", "insurances": ["労災保険", "国民健康保険", "国民年金", "雇用保険"], "smoking": "敷地内禁煙"}'::jsonb, '090-1088-1864', '〒866-0008 熊本県八代市郡築五番町126-2', '農業', '時給', 1050);


-- 1. 取り込む21件が求人（job_postings）にあるか
select
  i.acceptance_no                       as 求人受理番号,
  i.employer                            as 求人者名,
  case when jp.id is null then '× 見つからない' else '○ あります' end as 求人の登録,
  coalesce(o.name, '—')                 as アプリの所属機関,
  case when coalesce(jp.sheet, '{}'::jsonb) = '{}'::jsonb
       then '空（これから入ります）' else '入力済み（残します）' end as 求人票の内容
from imp_sheet i
left join job_postings jp on jp.acceptance_no = i.acceptance_no
left join organizations o on o.id = jp.organization_id
order by i.acceptance_no;

-- 2. 空いていて、今回埋まる基本項目（職種・勤務地・連絡先・給与）
select
  i.acceptance_no                                   as 求人受理番号,
  case when coalesce(jp.job_type, '') = ''      and i.job_type      <> '' then i.job_type      else '—' end as 入る職種,
  case when coalesce(jp.work_location, '') = '' and i.work_location <> '' then i.work_location else '—' end as 入る勤務地,
  case when coalesce(jp.contact, '') = ''       and i.contact       <> '' then i.contact       else '—' end as 入る連絡先,
  case when jp.wage_amount is null and i.wage_amount is not null
       then i.wage_kind || ' ' || i.wage_amount::text || '円' else '—' end        as 入る給与
from imp_sheet i
join job_postings jp on jp.acceptance_no = i.acceptance_no
where (coalesce(jp.job_type, '') = ''      and i.job_type      <> '')
   or (coalesce(jp.work_location, '') = '' and i.work_location <> '')
   or (coalesce(jp.contact, '') = ''       and i.contact       <> '')
   or (jp.wage_amount is null and i.wage_amount is not null)
order by i.acceptance_no;

-- 3. まとめ
select
  (select count(*) from imp_sheet)                                              as 取り込む件数,
  (select count(*) from imp_sheet i join job_postings jp
     on jp.acceptance_no = i.acceptance_no)                                     as 求人が見つかる件数,
  (select count(*) from imp_sheet i join job_postings jp
     on jp.acceptance_no = i.acceptance_no
    where coalesce(jp.sheet, '{}'::jsonb) <> '{}'::jsonb)                       as すでに入力済みの件数;
