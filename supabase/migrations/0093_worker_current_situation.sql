-- 外国人の「只今の状況」（経過メモ）。
-- Notion「ビザの状況」の 只今の状況 と同じ内容をシステム側でも持ち、
-- 「Notionに登録／更新」でNotionのselectプロパティへも書き込む。
-- 選択肢はアプリ側（src/lib/worker-situation.ts）に持ち、自由入力もできる。

alter table public.workers
  add column if not exists current_situation text not null default '';

comment on column public.workers.current_situation is
  '只今の状況（経過メモ。例: 特定技能の審査中 / 入国管理局からビザの許可おりた電話あり）';
