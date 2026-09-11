-- 督促の「立替払い」（本人の代わりに支払った分の記録と、本人からの返金の追いかけ）。
--
-- 市役所の納付書などを本人の代わりに支払ったとき、領収書の画像・金額・支払日を残し、
-- 本人にどの口座へ返してもらうよう指示したか（振込先・指示日）を記録する。
-- 返金があるまで「未返金」のアラートを出し、返金日を入れると完了にできる。
--
-- 何度実行しても安全（add column if not exists）。
alter table reminders
  add column if not exists advance_paid boolean not null default false, -- 本人の代わりに支払ったか
  add column if not exists advance_amount integer,                       -- 立て替えた金額（円）
  add column if not exists advance_paid_on date,                         -- 支払日
  add column if not exists advance_repay_to text not null default '',    -- 本人への返金の指示（振込先口座・期限など）
  add column if not exists advance_instructed_on date,                   -- 返金を指示した日
  add column if not exists advance_repaid_on date;                       -- 本人から返金があった日（空なら未返金）

-- 画像の種類: screenshot（会話のスクショ）/ receipt（立替の領収書）/ repayment（返金の証拠）
alter table reminder_images
  add column if not exists kind text not null default 'screenshot';

create index if not exists idx_reminders_advance_unpaid
  on reminders (worker_id) where advance_paid and advance_repaid_on is null;
