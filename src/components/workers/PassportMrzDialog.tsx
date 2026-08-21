"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { mrzToWorkerFields, parseMrz, type MrzResult } from "@/lib/mrz";

// パスポート下部の2行（MRZ）を貼り付けて、読み取れた内容をフォームへ入れるダイアログ。
//
// 貼り付け → 解析結果を確認 → 「この内容を反映」の順にする。
// 確認せずに入ることは無い。読み取れなかった項目は空のままにし、推測で埋めない。
// 貼り付けた文字はこのダイアログの中だけで持ち、保存も送信もしない。
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
  const [text, setText] = useState("");
  const [result, setResult] = useState<MrzResult | null>(null);

  const close = () => {
    setText(""); // 閉じたらMRZの文字は残さない
    setResult(null);
    onClose();
  };

  const read = () => setResult(parseMrz(text, today));

  const fields = result ? mrzToWorkerFields(result) : {};
  const nothingToApply = Object.keys(fields).length === 0;

  const apply = () => {
    onApply(fields);
    setText("");
    setResult(null);
  };

  return (
    <Modal open={open} title="パスポートMRZから入力" onClose={close}>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        パスポートの写真のページ下部にある2行（英数字と
        <span className="font-bold">&lt;</span>
        が並んだところ）を貼り付けてください。改行・空白・全角はこちらでそろえます。
        読み取った内容を確かめてから反映します。貼り付けた内容はこの画面を閉じると消えます。
      </p>

      <textarea
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null); // 直したら読み取り直してもらう
        }}
        spellCheck={false}
        autoComplete="off"
        placeholder={"P<VNMNGUYEN<<VAN<A<<<<<<<<<<<<<<<<<<<<<<<<<<\nC12345678<VNM9603025M3005084<<<<<<<<<<<<<<04"}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs leading-relaxed focus:border-brand focus:outline-none"
      />

      {!result && (
        <Button fullWidth icon={<ScanLine size={18} />} disabled={!text.trim()} onClick={read} className="mt-2">
          読み取る
        </Button>
      )}

      {result && !result.ok && (
        <p role="alert" className="mt-2 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {result.formatError}
        </p>
      )}

      {result?.ok && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-bold">読み取り結果</p>
          {result.invalidChecks.length > 0 && (
            <p
              role="alert"
              className="mb-2 rounded-lg bg-status-notice-bg px-3 py-2 text-xs leading-relaxed text-status-notice-fg"
            >
              読み取り結果を確認してください。
              チェックディジット（{result.invalidChecks.join("・")}）が合っていません。
              貼り付け間違い・読み取り間違いの可能性があります。内容が正しければこのまま反映できます。
            </p>
          )}
          <dl className="rounded-xl border border-border bg-background p-3 text-xs">
            <Row label="パスポート番号" value={result.passportNo} ok={result.checks.passportNo} />
            <Row
              label="国籍"
              value={result.nationality}
              note={
                result.nationality
                  ? `MRZ: ${result.nationalityCode}`
                  : `MRZ: ${result.nationalityCode}（対応表に無いため反映しません。手で入れてください）`
              }
            />
            <Row label="姓" value={result.surname} />
            <Row label="名" value={result.givenNames} />
            <Row label="氏名（反映する形）" value={fields.name ?? ""} />
            <Row label="生年月日" value={result.birth} ok={result.checks.birth} />
            <Row label="性別" value={result.sex} />
            <Row label="有効期限" value={result.expiry} ok={result.checks.expiry} />
          </dl>
          <p className="mt-1.5 text-[11px] text-muted">
            「—」の項目は読み取れなかったところです。勝手に埋めずそのままにします。
          </p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" fullWidth onClick={close}>
          キャンセル
        </Button>
        <Button fullWidth disabled={!result?.ok || nothingToApply} onClick={apply}>
          この内容を反映
        </Button>
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  ok,
  note,
}: {
  label: string;
  value: string;
  ok?: boolean; // チェックディジットの結果（ある項目だけ）
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-border/60 py-1 last:border-0">
      <dt className="shrink-0 font-bold text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-right">
        <span className={value ? "font-bold" : "text-muted"}>{value || "—"}</span>
        {ok === false && <span className="ml-1.5 text-[10px] font-bold text-seal">要確認</span>}
        {note && <span className="block text-[10px] text-muted">{note}</span>}
      </dd>
    </div>
  );
}
