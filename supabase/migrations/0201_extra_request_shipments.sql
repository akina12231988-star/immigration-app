-- 追加資料の提出依頼（application_extra_requests）に、2回目以降の郵送の記録を持たせる。
--
-- 追加資料を何回かに分けて入管へ送ることがあり、これまでは郵送した日・追跡番号を
-- 1回分しか残せなかった。1回目は従来の sent_on / tracking_no のまま、
-- 2回目以降を shipments（jsonb の配列）に「郵送した日・送った資料・追跡番号」で残す。
--   例: [{"sent_on":"2026-10-19","items":"令和6年分賃金台帳","tracking_no":"1234 5678 9012"}]
-- 何度実行しても安全（if not exists）
alter table application_extra_requests
  add column if not exists shipments jsonb not null default '[]'::jsonb;

comment on column application_extra_requests.shipments is
  '2回目以降の郵送の記録（郵送した日・送った資料・レターパックの追跡番号の配列）。1回目は sent_on / tracking_no';
