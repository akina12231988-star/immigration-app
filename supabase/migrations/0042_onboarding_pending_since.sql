-- 入社書類メール: 後送・未入手の経過日数アラート
-- 「あとで送る」とした日（pending_since）を持ち、ホームの未提出一覧で
-- 「誰が・何を・何日経過」を確認できるようにする。アラート対象を後送に加えて未入手にも広げる。

alter table onboarding_documents add column if not exists pending_since date;

-- 既存の後送・未入手行は行の作成日を起点として引き継ぐ
update onboarding_documents
  set pending_since = created_at::date
  where pending_since is null and status in ('後送', '未入手') and received_on is null;

-- アラート用の部分インデックスを未入手も含む形に張り直す
drop index if exists idx_onboarding_docs_pending;
create index if not exists idx_onboarding_docs_pending
  on onboarding_documents (status, due_on)
  where status in ('後送', '未入手') and received_on is null;
