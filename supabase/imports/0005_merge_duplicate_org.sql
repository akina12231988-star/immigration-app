-- 令和8年度の取り込みで会社が二重に登録されたものを、元の会社にまとめる。
--
-- 「高濱伸吉」と「髙濱　伸吉」のように、漢字の異体字（髙・高、﨑・崎、濵・濱）が
-- 違うだけの会社が別々に登録されてしまうことがある。
-- 0004 で新しく作った会社のうち、異体字をそろえると既存の会社と同じになるものを探し、
-- 求人・紹介の紐づけを元の会社へ付け替えてから、新しく作った方を消す。
--
-- データは変わるが、消すのは 0004 で作った会社だけ。何度実行しても安全。
-- 「Run without RLS」で実行してください。

-- 異体字をそろえて比べるための関数（この接続の中だけ）
create or replace function pg_temp.norm2(t text) returns text language sql immutable as $fn$
  select upper(translate(
    regexp_replace(coalesce(t, ''), '[[:space:]　・（）()、。，,.]', '', 'g'),
    '髙﨑濵栁桒', '高崎濱柳桑'
  ))
$fn$;

-- まとめる組み合わせを作る（新しく作った会社 → 元からある会社）
drop table if exists org_merge;
create temp table org_merge as
select d.id as dup_id, d.name as dup_name, k.id as keep_id, k.name as keep_name
from organizations d
join lateral (
  select o.id, o.name
  from organizations o
  where o.id <> d.id
    and coalesce(o.note, '') <> '求人管理簿の過去データ（2026年4月〜2027年3月）で登録'
    and (
      pg_temp.norm2(o.name) = pg_temp.norm2(d.name)
      or pg_temp.norm2(o.name) like '%' || pg_temp.norm2(d.name) || '%'
    )
  order by o.created_at
  limit 1
) k on true
where d.note = '求人管理簿の過去データ（2026年4月〜2027年3月）で登録';

-- 求人・紹介の紐づけを元の会社へ付け替える
update job_postings jp
set organization_id = m.keep_id
from org_merge m
where jp.organization_id = m.dup_id;

update job_applications a
set organization_id = m.keep_id
from org_merge m
where a.organization_id = m.dup_id;

-- 付け替えが済んだら、新しく作った方の会社を消す。
-- ほかの記録（請求・面談など）から使われていて消せないものは、そのまま残す。
do $do$
declare
  r record;
begin
  for r in select dup_id, dup_name from org_merge loop
    begin
      delete from organizations where id = r.dup_id;
    exception
      when foreign_key_violation then
        raise notice '「%」は他の記録から使われているため残しました', r.dup_name;
    end;
  end loop;
end
$do$;

-- 結果（この表を送ってください）
select '1. まとめた会社' as 項目,
       coalesce((select string_agg(dup_name || ' → ' || keep_name, ' / ') from org_merge), '（なし）') as 内容
union all
select '2. まとめたあとに残っている二重の会社',
       coalesce((select string_agg(o.name, ' / ') from organizations o
                 where o.note = '求人管理簿の過去データ（2026年4月〜2027年3月）で登録'
                   and exists (select 1 from org_merge m where m.dup_id = o.id)), '（なし）')
union all
select '3. 今年度に新しく作った会社（そのまま残すもの）',
       coalesce((select string_agg(o.name, ' / ') from organizations o
                 where o.note = '求人管理簿の過去データ（2026年4月〜2027年3月）で登録'
                   and not exists (select 1 from org_merge m where m.dup_id = o.id)), '（なし）');
