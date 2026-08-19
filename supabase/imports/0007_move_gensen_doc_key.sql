-- 入社書類メールで添付した源泉徴収票を、外国人詳細の「源泉徴収票」セクションと
-- 同じ置き場所（gensen_r{令和年}）に移す。
--
-- これまで、入社書類メールからの添付だけ doc_key が 'gensen' になっていて、
-- 外国人詳細の源泉徴収票（gensen_r8 など）に出てきませんでした。
-- アプリ側は新しい保存先に直したので、既に入っている分をこのSQLで移します。
--
-- 令和年は、その書類を登録した日から決めます（2026年に登録 → 令和8年）。
-- 同じ人・同じ年の書類が既にあるときは、二重にならないよう移しません。
-- 何度実行しても安全です。
update onboarding_documents d
set doc_key = 'gensen_r' || (extract(year from d.created_at at time zone 'Asia/Tokyo')::int - 2018),
    label = '令和' || (extract(year from d.created_at at time zone 'Asia/Tokyo')::int - 2018) || '年分源泉徴収票'
where d.doc_key = 'gensen'
  and not exists (
    select 1 from onboarding_documents x
    where x.worker_id = d.worker_id
      and x.doc_key = 'gensen_r' || (extract(year from d.created_at at time zone 'Asia/Tokyo')::int - 2018)
  );

-- 結果（この表を送ってください）
select '1. 移した源泉徴収票' as 項目,
       count(*)::text || ' 件' as 内容
from onboarding_documents
where doc_key like 'gensen_r%'
union all
select '2. 移せずに残っている源泉徴収票（同じ年の書類が既にある人）',
       coalesce(string_agg(w.name, ' / '), '（なし）')
from onboarding_documents d
join workers w on w.id = d.worker_id
where d.doc_key = 'gensen';
