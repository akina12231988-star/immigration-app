-- 外国人登録の選択肢を追加。既存データは変更しない（add value のみ）。

-- 支援区分に「支援開始前」を追加（支援開始前の段階を表せるようにする）
alter type support_scope add value if not exists '支援開始前';

-- 状態に「申請準備中」を追加（申請の準備段階を表せるようにする）
alter type worker_status add value if not exists '申請準備中';
