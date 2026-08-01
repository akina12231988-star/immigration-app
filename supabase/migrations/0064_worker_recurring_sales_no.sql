-- 定期売上No.（freee販売の定期売上の伝票番号。例: SP-0000000225）を workers に追加（追加のみ）。
-- 毎月の支援代はこの番号で継続請求するため、外国人1人につき1つ持つ。
-- 申請詳細の売上登録・外国人詳細・月末の請求書作成のどこからでも登録できる。
alter table workers
  add column if not exists recurring_sales_no text not null default ''; -- 定期売上No.
