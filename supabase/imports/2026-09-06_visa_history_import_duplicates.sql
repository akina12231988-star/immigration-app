-- 在留資格の履歴の取り込み（同じ名前の人が複数いた分・13件）
--
-- 先に 2026-09-06_visa_history_import.sql を実行してください。
-- そちらでは「同じ名前の人が複数いる」ため取り込めなかった分を、
-- 氏名 ＋ 生年月日 で1人に決めて取り込みます。
-- 生年月日でも1人に決まらない分は取り込まず、最後の表に出ます。
-- 何度実行しても二重にはなりません。

begin;

create temporary table tmp_visa_import2 (
  name        text,
  birth       date,
  permit_date date,
  status      text,
  kind        text,
  expiry_date date,
  card_no     text,
  note        text
) on commit drop;

insert into tmp_visa_import2 (name, birth, permit_date, status, kind, expiry_date, card_no, note) values
  ('HOANG THI MUI', '1997-05-05', '2024-09-24', '特定技能1号', '更新許可', null, 'SA33148211RG', '友田 豊敏の在籍履歴から取り込み'),
  ('HOANG THI MUI', '1997-05-05', '2025-07-31', '特定技能1号', '更新許可', null, 'UH99690767RG', '友田 豊敏の在籍履歴から取り込み'),
  ('NGUYEN MINH HIEU', '1992-02-14', '2025-10-09', '特定技能1号', '更新許可', '2026-10-09', 'UH43295160RG', '岩崎 恭志の在籍履歴から取り込み'),
  ('NGUYEN MINH HIEU', '2002-01-27', '2026-03-24', '特定活動（特定技能1号移行準備）', 'ビザ許可', '2026-06-30', 'LJ46661184RG', '株式会社 タツミ工業の在籍履歴から取り込み'),
  ('NGUYEN THI THAM', '1986-04-23', '2025-05-19', '特定技能1号', 'ビザ許可', '2026-05-21', 'UH96039554RG', '岩下 みちるの在籍履歴から取り込み'),
  ('NGUYEN THI THAM', '1986-04-23', '2026-05-22', '特定技能1号', '更新許可', '2027-05-22', 'LJ16695690RG', '岩下 みちるの在籍履歴から取り込み'),
  ('NGUYEN THI THAM', '1991-10-10', '2025-09-11', '特定技能1号', 'ビザ許可', '2026-09-11', 'UH17903018RG', '井上 洋介の在籍履歴から取り込み'),
  ('NGUYEN VAN DUC', '1992-02-06', '2025-07-22', '特定技能1号', 'ビザ許可', '2026-07-22', 'UH78185680RD', '有限会社 國崎青果の在籍履歴から取り込み'),
  ('TRAN THI THUY', '1985-04-20', '2026-05-29', '特定活動（特定技能1号移行準備）', 'ビザ許可', '2026-11-29', 'LJ11610167RG', '有限会社 國崎青果の在籍履歴から取り込み'),
  ('TRAN THI THUY', '1995-08-03', '2025-07-28', '特定技能1号', 'ビザ許可', '2026-08-15', 'UH32274818RG', '藤吉 淳の在籍履歴から取り込み'),
  ('VU THI HIEN', '1990-03-20', '2024-08-06', '特定技能1号', 'ビザ許可', '2025-08-06', 'SA51404908RG', '西田 祐一の在籍履歴から取り込み'),
  ('VU THI HIEN', '1990-03-20', '2025-07-31', '特定技能1号', '更新許可', '2026-08-06', 'UH06254946RG', '西田 祐一の在籍履歴から取り込み'),
  ('VU THI HIEN', '1990-11-17', '2026-01-27', '特定技能1号', '更新許可', '2027-02-02', 'LJ59208736RG', '澤村 博文の在籍履歴から取り込み');

create temporary view tmp_visa_match2 as
select
  t.*,
  (select count(*) from workers w
    where upper(regexp_replace(w.name, '[[:space:]　]', '', 'g'))
        = upper(regexp_replace(t.name, '[[:space:]　]', '', 'g'))
      and w.birth = t.birth) as hit_count,
  (select w.id from workers w
    where upper(regexp_replace(w.name, '[[:space:]　]', '', 'g'))
        = upper(regexp_replace(t.name, '[[:space:]　]', '', 'g'))
      and w.birth = t.birth
    order by w.created_at, w.id limit 1) as worker_id
from tmp_visa_import2 t;

insert into worker_visa_history (worker_id, permit_date, status, kind, expiry_date, card_no, note)
select m.worker_id, m.permit_date, m.status, m.kind, m.expiry_date, m.card_no, m.note
from tmp_visa_match2 m
where m.hit_count = 1
  and not exists (
    select 1 from worker_visa_history h
    where h.worker_id = m.worker_id
      and h.permit_date = m.permit_date
      and h.status = m.status
  );

-- 結果の表
select '取り込み済みの件数' as 区分, null::text as 名前, null::date as 生年月日, count(*)::text as 件数
from worker_visa_history h where h.note like '%在籍履歴から取り込み'
union all
select '生年月日でも見つからない', m.name, m.birth, count(*)::text
from tmp_visa_match2 m where m.hit_count = 0 group by m.name, m.birth
union all
select '生年月日でも複数いる', m.name, m.birth, count(*)::text
from tmp_visa_match2 m where m.hit_count > 1 group by m.name, m.birth
order by 1, 2, 3;

commit;
