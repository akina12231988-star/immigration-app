"use client";

import { useState } from "react";
import { Check, Copy, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  mrzCopyItems,
  mrzToWorkerFields,
  normalizeMrz,
  padMrzLine1,
  parseMrz,
  type MrzResult,
} from "@/lib/mrz";

// パスポート下部の2行（MRZ）を1行目・2行目に分けて入力して読み取るパネル。
// 外国人詳細のパスポート枠に直接置き、新規登録のダイアログからも使う。
//
// チェックディジットがすべて合えば、読み取り結果をそのままパスポートの欄へ反映する
// （反映は下書きなので、保存を押すまで確定しない。上書きになる項目は確認が出る）。
// チェックが合わないときだけ、警告を見てから「この内容を反映」で入れる。
// 読み取れなかった項目は空のままにし、推測で埋めない。
// 反映するとMRZの2行も一緒に保存され（0095）、保存後はパスポート枠の
// コピー候補（SavedMrzCopyList）からいつでも写せる。
export function PassportMrzPanel({
  today,
  onApply,
}: {
  today: string; // 生年月日・有効期限の西暦（19xx/20xx）を決めるのに使う
  onApply: (fields: Record<string, string>) => void;
}) {
  // 1行目・2行目を分けて入力する（1つの欄だと折り返しでどこまでが1行目か分からなくなるため）
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [result, setResult] = useState<MrzResult | null>(null);

  // 1行目の入力。2行まとめて貼り付けたとき（44文字を超えたとき）は自動で2行に分ける
  const changeLine1 = (value: string) => {
    setResult(null); // 直したら読み取り直してもらう
    const v = normalizeMrz(value);
    if (v.length > 44 && !/^<+$/.test(v.slice(44))) {
      setLine1(v.slice(0, 44));
      setLine2(v.slice(44, 88));
      return;
    }
    setLine1(value);
  };

  // 読み取り時は、1行目の足りない末尾の < を44文字まで自動で埋める。
  // チェックディジットがすべて合っていれば、そのままパスポートの欄へ反映する
  // （合わないときは読み取り間違いの可能性があるので、下の警告を見てから手で反映）
  const read = () => {
    const r = parseMrz(`${padMrzLine1(line1)}\n${normalizeMrz(line2)}`, today);
    setResult(r);
    if (r.ok && r.invalidChecks.length === 0) {
      const f = mrzToWorkerFields(r);
      if (Object.keys(f).length > 0) onApply(f);
    }
  };

  const fields = result ? mrzToWorkerFields(result) : {};
  const nothingToApply = Object.keys(fields).length === 0;

  const apply = () => {
    onApply(fields);
    setLine1("");
    setLine2("");
    setResult(null);
  };

  // 文字数の表示。44でそろえば緑、超えたら赤、入力途中（少ない）はグレー
  // （1行目は末尾の < を自動で埋めるので、少なくても問題ない）
  const len1 = normalizeMrz(line1).length;
  const len2 = normalizeMrz(line2).length;
  const countCls = (len: number, over: boolean) =>
    over ? "text-seal" : len === 44 ? "text-status-approved-fg" : "text-muted";

  return (
    <div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        パスポートの写真のページ下部にある2行（英数字と
        <span className="font-bold">&lt;</span>
        が並んだところ）を、1行目・2行目に分けて入れてください。空白・全角はこちらでそろえます。
        1行目の末尾に続く &lt; は足りなくても自動で埋めます（2行まとめて貼り付けても自動で分かれます）。
        「読み取る」を押すと、チェックの数字が合えば読み取り結果をそのままパスポートの欄に反映します
        （保存を押すまで確定しません）。
      </p>

      <div className="flex flex-col gap-2">
        <label className="block">
          <span className="mb-0.5 flex items-center justify-between text-[11px] font-bold text-muted">
            1行目（P&lt; から始まる、氏名の行）
            <span
              className={`font-normal tabular-nums ${countCls(len1, padMrzLine1(line1).length > 44)}`}
            >
              {len1}/44
            </span>
          </span>
          <input
            value={line1}
            onChange={(e) => changeLine1(e.target.value)}
            onBlur={() => setLine1(padMrzLine1(line1))}
            spellCheck={false}
            autoComplete="off"
            placeholder="P<VNMNGUYEN<<VAN<A（末尾の<は自動で埋めます）"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs focus:border-brand focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 flex items-center justify-between text-[11px] font-bold text-muted">
            2行目（番号から始まる行。44文字ちょうど）
            <span className={`font-normal tabular-nums ${countCls(len2, len2 > 44)}`}>
              {len2}/44
            </span>
          </span>
          <input
            value={line2}
            onChange={(e) => {
              setLine2(e.target.value);
              setResult(null); // 直したら読み取り直してもらう
            }}
            spellCheck={false}
            autoComplete="off"
            placeholder="C12345678<VNM9603025M3005084<<<<<<<<<<<<<<04"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs focus:border-brand focus:outline-none"
          />
        </label>
      </div>

      {!result && (
        <Button
          fullWidth
          icon={<ScanLine size={18} />}
          disabled={!line1.trim() || !line2.trim()}
          onClick={read}
          className="mt-2"
        >
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
          <MrzCopyList result={result} />

          <p className="mb-1.5 mt-3 text-xs font-bold">読み取り結果</p>
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
          {result.invalidChecks.length === 0 ? (
            /* チェックがすべて合っていれば読み取り時に反映済み（保存で確定する） */
            <p className="mt-3 rounded-lg bg-status-approved-bg px-3 py-2 text-xs font-bold leading-relaxed text-status-approved-fg">
              読み取り結果をそのままパスポートの欄に反映しました
              （入力済みの内容を書き換える項目があるときは確認が出ます）。
              内容を確かめて「保存」を押すと確定します。
            </p>
          ) : (
            <Button fullWidth disabled={nothingToApply} onClick={apply} className="mt-3">
              この内容を反映
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// 保存済みのMRZ（workers.passport_mrz）からコピー候補を出す。
// 表示のたびに2行を解析するので、読み取り結果の各項目は別に保存しない。
// 一覧は長いのでトグルに収納し、押したときだけ開く
export function SavedMrzCopyList({ mrz, today }: { mrz: string; today: string }) {
  const result = parseMrz(mrz, today);
  if (!result.ok) return null; // 形が崩れて解析できないときは何も出さない
  return (
    <details className="rounded-lg border border-border bg-surface px-3 py-2">
      <summary className="cursor-pointer text-xs font-bold text-brand">
        コピーする（特定技能試験の申込などに）
      </summary>
      <div className="mt-2">
        <MrzCopyList
          result={result}
          bare
          note="保存済みのMRZから組み立てています。パスポートを変えたときは下の「MRZを貼り付けて読み取る」で入れ直してください。"
        />
      </div>
    </details>
  );
}

// 読み取り結果の項目ごとのコピー一覧（2行そのもの・番号・姓名・生年月日など）。
// 試験（プロメトリック）の申込などに写す用。bare はトグルの中に入れるとき（見出しを出さない）
function MrzCopyList({
  result,
  note,
  bare = false,
}: {
  result: MrzResult;
  note?: string;
  bare?: boolean;
}) {
  // どの項目をコピーしたか（押した合図を少しの間だけ出す）
  const [copied, setCopied] = useState<string | null>(null);

  // 押した項目をクリップボードへ入れる（コピー以外の保存・送信はしない）
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* クリップボードが使えないときは、文字を選んでコピーしてもらう */
    }
  };

  return (
    <div>
      {!bare && (
        <p className="mb-1.5 text-xs font-bold">コピーする（特定技能試験の申込などに）</p>
      )}
      <p className="mb-1.5 text-[11px] leading-relaxed text-muted">
        {note ??
          "「コピー」を押すとその項目をまるごと写します。2行はそのまま選べるので、必要なところだけなぞって部分的にコピーもできます。"}
      </p>
      <ul className="flex flex-col gap-1">
        {mrzCopyItems(result).map((item) => (
          <li
            key={item.label}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5"
          >
            <span className="w-[104px] shrink-0 text-[11px] font-bold text-muted">
              {item.label}
            </span>
            <span
              className={`min-w-0 flex-1 select-text overflow-x-auto whitespace-pre text-xs ${
                item.mono ? "font-mono" : "font-bold"
              }`}
            >
              {item.value}
            </span>
            <button
              type="button"
              onClick={() => void copy(item.label, item.value)}
              aria-label={`${item.label}をコピー`}
              className="flex min-h-[30px] shrink-0 items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-bold text-brand"
            >
              {copied === item.label ? <Check size={12} /> : <Copy size={12} />}
              {copied === item.label ? "コピーしました" : "コピー"}
            </button>
          </li>
        ))}
      </ul>
    </div>
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
