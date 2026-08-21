-- 応募が「どの求人票に応募したか」まで紐づいているかを見る（確認だけ）。
--
-- job_applications.job_posting_id が求人票（job_postings）への紐付けです。
-- 画面から応募を登録するときは求人を選べますが、必須ではありません。
-- 過去データの取り込み（imports 0002・0004 など）で入れた応募は、
-- 会社（organization_id）だけ入っていて求人票に紐づいていないことがあります。
--
-- 様式30（求人者リスト）は「どの求人に紹介実績があるか」で作るため、
-- 紐付いていないと拾えません。まずは今の状態を数えます。
--
-- 何度実行しても安全です（select だけ）。

-- ① 全体の件数
select
  count(*)                                          as 応募の総数,
  count(*) filter (where job_posting_id is not null) as 求人票に紐付いている,
  count(*) filter (where job_posting_id is null)     as 求人票に紐付いていない,
  count(*) filter (where result = '採用')            as うち採用,
  count(*) filter (where result = '採用' and job_posting_id is not null) as 採用かつ紐付いている,
  count(*) filter (where result = '採用' and job_posting_id is null)     as 採用だが紐付いていない
from job_applications;

-- ② 訪問予定日（2026-08-26）から過去1年間の応募だけで同じ集計
select
  count(*)                                          as 過去1年の応募,
  count(*) filter (where job_posting_id is not null) as 求人票に紐付いている,
  count(*) filter (where job_posting_id is null)     as 求人票に紐付いていない
from job_applications
where applied_on between date '2026-08-26' - interval '1 year' and date '2026-08-26';

-- ③ 紐付いていない応募を会社ごとに数える（多い順）。
--    ここに出る会社は、様式30で「求人票との紐付けなし（会社で判定）」と表示されます
select
  o.name                                   as 会社,
  count(*)                                 as 紐付いていない応募,
  count(*) filter (where a.result = '採用') as うち採用,
  min(a.applied_on)                        as 最初の応募日,
  max(a.applied_on)                        as 最後の応募日
from job_applications a
left join organizations o on o.id = a.organization_id
where a.job_posting_id is null
group by o.name
order by count(*) desc, o.name;

-- ④ 過去1年に採用があった会社の、手数料管理簿の入金状況。
--    様式30に載せてよい（入金済みの）会社がどれかを、実データで確かめる
with hired as (
  select distinct a.organization_id
  from job_applications a
  where a.result = '採用'
    and a.applied_on between date '2026-08-26' - interval '1 year' and date '2026-08-26'
)
select
  o.name                                        as 会社,
  count(f.id)                                   as 手数料台帳の行数,
  count(f.id) filter (where f.paid_on is not null) as 入金済み,
  count(f.id) filter (where f.paid_on is null and f.billed_on is not null) as 請求済み未入金,
  count(f.id) filter (where f.paid_on is null and f.billed_on is null)     as 未請求,
  max(f.paid_on)                                as 最後の入金日,
  case
    when count(f.id) filter (where f.paid_on is not null) > 0 then '○ 載せられる'
    when count(f.id) = 0 then '× 台帳に無し'
    when count(f.id) filter (where f.billed_on is not null) > 0 then '× 請求済み・未入金'
    else '× 未請求'
  end                                           as 様式30に載せられるか
from hired h
join organizations o on o.id = h.organization_id
left join referral_fees f on f.organization_id = h.organization_id
group by o.name
order by 様式30に載せられるか, o.name;
