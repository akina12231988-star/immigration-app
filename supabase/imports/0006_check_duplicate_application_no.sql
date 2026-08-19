-- 申請番号が重複している申請を洗い出す（確認だけ・データは変わりません）。
--
-- 窓口申請の登録で「この申請番号は既に登録されています」と出るときに、
-- 本当に二重登録があるのかを確かめるためのものです。
-- 「号」の有無・空白・全角半角の違いをそろえて数えます。
select
  regexp_replace(upper(translate(application_no, 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ０１２３４５６７８９',
                                 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')),
                 '[[:space:]　]|号+$', '', 'g') as 申請番号,
  count(*) as 件数,
  string_agg(name || '（' || coalesce(application_date::text, '申請日なし') || '・' || status || '）',
             ' / ' order by created_at) as 申請
from immigration_applications
group by 1
having count(*) > 1
order by 件数 desc, 申請番号;
