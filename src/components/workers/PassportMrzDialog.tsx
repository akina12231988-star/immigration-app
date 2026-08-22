"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PassportMrzPanel } from "@/components/workers/PassportMrzPanel";

// パスポートMRZから入力するダイアログ（新規登録フォームの入口）。
// 中身は外国人詳細のパスポート枠と同じパネル（PassportMrzPanel）。
// 閉じるとパネルごと消えるので、貼り付けたMRZの文字は残らない。
export function PassportMrzDialog({
  open,
  today,
  onClose,
  onApply,
}: {
  open: boolean;
  today: string; // 生年月日・有効期限の西暦（19xx/20xx）を決めるのに使う
  onClose: () => void;
  onApply: (fields: Record<string, string>) => void;
}) {
  return (
    <Modal open={open} title="パスポートMRZから入力" onClose={onClose}>
      <PassportMrzPanel today={today} onApply={onApply} />
      <Button variant="secondary" fullWidth onClick={onClose} className="mt-2">
        キャンセル
      </Button>
    </Modal>
  );
}
