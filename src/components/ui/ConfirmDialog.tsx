"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// 削除など取り消せない操作の確認ダイアログ
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "削除する",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="mb-4 text-sm leading-relaxed">{message}</p>
      <div className="flex gap-2">
        <Button variant="secondary" fullWidth onClick={onCancel} disabled={busy}>
          キャンセル
        </Button>
        <Button variant="seal" fullWidth onClick={onConfirm} disabled={busy}>
          {busy ? "処理中…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
