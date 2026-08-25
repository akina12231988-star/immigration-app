"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { Plus, Printer, Save, Trash2, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { useWorkHistoryRows } from "@/components/workers/useWorkHistoryRows";
import { errorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/ssw/calc";
import { VISA_TYPES } from "@/types/ssw";

interface ResumeWorker {
  name: string;
  kana: string;
  birth: string | null;
  gender: string;
  address: string;
  nationality: string;
  residenceStatus: string;
  field: string;
  specialtyGrade: string;
  otherQualifications: string;
}

interface ResumeHistory {
  id: string;
  visa: string;
  start: string;
  end: string | null;
  org: string;
  role: string;
}

const FIELD =
  "w-full min-w-0 bg-transparent outline-none border-b border-dashed border-gray-300 focus:bg-yellow-100 print:border-0 print:bg-transparent";

// 履歴書。氏名・住所などの本人情報と職歴を、この画面でそのまま直して印刷できる
export function ResumeSheet({
  workerId,
  canEdit,
  photoUrl,
  worker: initialWorker,
  histories,
}: {
  workerId: string;
  canEdit: boolean;
  photoUrl: string;
  worker: ResumeWorker;
  histories: ResumeHistory[];
}) {
  const router = useRouter();
  // 発行年月日は自動表示ではなく、印刷前に指定できるようにする（初期値は今日）
  const [issuedOn, setIssuedOn] = useState(todayStr());
  const [worker, setWorker] = useState(initialWorker);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // 職歴。直すと開始日の古い順に並べ直す
  const touched = () => {
    setDirty(true);
    setMessage(null);
  };
  const { rows: shown, setRow, addRow, removeRow, saveRows } = useWorkHistoryRows(
    histories,
    touched,
    "特定技能1号",
  );

  const issuedText = issuedOn
    ? new Date(`${issuedOn}T00:00:00`).toLocaleDateString("ja-JP")
    : "";

  const setField = <K extends keyof ResumeWorker>(key: K, value: ResumeWorker[K]) => {
    setWorker((w) => ({ ...w, [key]: value }));
    setDirty(true);
    setMessage(null);
  };
  const save = async () => {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    try {
      await updateWorker(supabase, workerId, {
        name: worker.name,
        kana: worker.kana,
        birth: worker.birth || null,
        gender: worker.gender,
        address: worker.address,
        nationality: worker.nationality,
        residence_status: worker.residenceStatus,
        field: worker.field,
        specialty_grade: worker.specialtyGrade,
        other_qualifications: worker.otherQualifications,
      });
      await saveRows(supabase, workerId);
      setDirty(false);
      setMessage({ ok: true, text: "保存しました。このまま印刷できます。" });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err, "保存に失敗しました") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/workers" />
          <h1 className="flex-1 text-lg font-bold">履歴書</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3 px-4 py-4 lg:px-8">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">発行年月日</span>
            <input
              type="date"
              value={issuedOn}
              onChange={(e) => setIssuedOn(e.target.value)}
              className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none"
            />
          </label>
          {canEdit && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground disabled:opacity-50"
            >
              <Save size={18} />
              {busy ? "保存中…" : dirty ? "保存する" : "保存済み"}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-brand px-5 py-3 text-sm font-bold text-brand"
          >
            <Printer size={18} />
            印刷・PDF保存
          </button>
          {dirty && (
            <span className="text-[11px] font-bold text-seal">
              保存されていない変更があります（先に保存してから印刷してください）
            </span>
          )}
          {canEdit && (
            <span className="w-full text-[11px] leading-relaxed text-muted">
              点線の欄はこの画面でそのまま直せます（外国人の登録内容と職歴に書き戻します）。
              職歴は「職歴を追加」で増やせ、ごみ箱のボタンで消せます。
              うすい色の行は所属機関の雇用開始日から自動で出している職歴です。直して保存すると職歴として登録され、
              以後は普通の行と同じように消せます（消すときは所属機関の雇用開始日も見直してください）。
            </span>
          )}
          {message && (
            <p
              role="status"
              className={`w-full rounded-lg px-3 py-2 text-xs ${
                message.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>

      <div className="print-root">
        <div className="worker-sheet mx-auto mb-6 max-w-[210mm] border border-border bg-white p-[12mm] text-black print:mb-0 print:border-0">
          <div className="mb-4 flex items-start justify-between border-b-2 border-black pb-2">
            <h2 className="text-2xl font-black">履歴書</h2>
            <p className="text-xs text-gray-500">発行年月日: {issuedText || "—"}</p>
          </div>

          {/* 氏名・写真 */}
          <div className="mb-5 flex gap-6">
            <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row
                label="氏名"
                value={worker.name}
                onChange={(v) => setField("name", v)}
                canEdit={canEdit}
                big
              />
              <Row
                label="フリガナ"
                value={worker.kana}
                onChange={(v) => setField("kana", v)}
                canEdit={canEdit}
              />
              <Row
                label="生年月日"
                value={worker.birth ?? ""}
                onChange={(v) => setField("birth", v)}
                canEdit={canEdit}
                type="date"
              />
              <Row
                label="性別"
                value={worker.gender}
                onChange={(v) => setField("gender", v)}
                canEdit={canEdit}
              />
              <Row
                label="国籍"
                value={worker.nationality}
                onChange={(v) => setField("nationality", v)}
                canEdit={canEdit}
              />
              <Row
                label="現在の在留資格"
                value={worker.residenceStatus}
                onChange={(v) => setField("residenceStatus", v)}
                canEdit={canEdit}
              />
              <Row
                label="住所"
                value={worker.address}
                onChange={(v) => setField("address", v)}
                canEdit={canEdit}
                wide
              />
              <Row
                label="分野・職種"
                value={worker.field}
                onChange={(v) => setField("field", v)}
                canEdit={canEdit}
                wide
              />
            </dl>
            <div className="flex h-[40mm] w-[32mm] shrink-0 items-center justify-center overflow-hidden border border-gray-400 bg-gray-50">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="顔写真" className="h-full w-full object-cover" />
              ) : (
                <UserRound size={48} className="text-gray-300" />
              )}
            </div>
          </div>

          {/* 職歴 */}
          <h3 className="mb-2 border-b border-black pb-1 text-base font-bold">職歴</h3>
          {shown.length === 0 ? (
            <p className="mb-2 text-sm text-gray-500">職歴の登録はありません。</p>
          ) : (
            <table className="mb-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-400 text-left text-xs text-gray-600">
                  <th className="w-[24%] py-1 pr-2">期間</th>
                  <th className="w-[20%] py-1 pr-2">在留資格</th>
                  <th className="w-[28%] py-1 pr-2">勤務先・受入機関</th>
                  <th className="py-1">職種・仕事内容</th>
                  {canEdit && <th className="w-[28px] py-1 print:hidden" />}
                </tr>
              </thead>
              <tbody>
                {shown.map((h) => (
                  <tr
                    key={h.key}
                    className={`border-b border-gray-200 align-top ${
                      h.auto ? "text-gray-500 print:text-black" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-2 tabular-nums">
                      {canEdit ? (
                        <span className="flex items-center gap-0.5">
                          <input
                            type="date"
                            value={h.start}
                            onChange={(e) => setRow(h.key, { start: e.target.value })}
                            className={`${FIELD} text-xs`}
                          />
                          <span className="shrink-0">〜</span>
                          <input
                            type="date"
                            value={h.end}
                            onChange={(e) => setRow(h.key, { end: e.target.value })}
                            className={`${FIELD} text-xs`}
                          />
                        </span>
                      ) : (
                        `${h.start} 〜 ${h.end || "現在"}`
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      {canEdit ? (
                        <select
                          value={h.visa}
                          onChange={(e) => setRow(h.key, { visa: e.target.value })}
                          className={`${FIELD} text-xs`}
                        >
                          {!VISA_TYPES.includes(h.visa as (typeof VISA_TYPES)[number]) && (
                            <option value={h.visa}>{h.visa || "（未選択）"}</option>
                          )}
                          {VISA_TYPES.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        h.visa
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      {canEdit ? (
                        <input
                          value={h.org}
                          onChange={(e) => setRow(h.key, { org: e.target.value })}
                          className={FIELD}
                        />
                      ) : (
                        h.org || "—"
                      )}
                    </td>
                    <td className="py-1.5">
                      {canEdit ? (
                        <input
                          value={h.role}
                          onChange={(e) => setRow(h.key, { role: e.target.value })}
                          className={FIELD}
                        />
                      ) : (
                        h.role || "—"
                      )}
                    </td>
                    {canEdit && (
                      <td className="py-1.5 print:hidden">
                        {/* 自動で出している行は職歴として登録するまで消せない（保存すると消せるようになる） */}
                        {!h.auto && (
                          <button
                            type="button"
                            onClick={() => removeRow(h.key)}
                            aria-label="この職歴を消す"
                            className="text-gray-400 hover:text-seal"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={addRow}
              className="mb-5 inline-flex items-center gap-1 rounded-lg border border-gray-400 px-2.5 py-1 text-xs font-bold text-gray-600 print:hidden"
            >
              <Plus size={13} />
              職歴を追加
            </button>
          )}

          {/* 資格 */}
          <h3 className="mb-2 border-b border-black pb-1 text-base font-bold">資格・合格</h3>
          <dl className="grid grid-cols-1 gap-y-1.5 text-sm">
            <Row
              label="専門級の合格名"
              value={worker.specialtyGrade}
              onChange={(v) => setField("specialtyGrade", v)}
              canEdit={canEdit}
            />
            <Row
              label="その他の資格・合格名"
              value={worker.otherQualifications}
              onChange={(v) => setField("otherQualifications", v)}
              canEdit={canEdit}
            />
          </dl>
        </div>
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          .worker-sheet {
            width: 210mm;
            min-height: 297mm;
            box-sizing: border-box;
          }
          input,
          select {
            border: 0 !important;
            background: transparent !important;
            color: #000 !important;
            -webkit-appearance: none !important;
            appearance: none !important;
          }
          input[type="date"]::-webkit-calendar-picker-indicator {
            display: none;
          }
        }
      `}</style>
    </>
  );
}

function Row({
  label,
  value,
  onChange,
  canEdit,
  type = "text",
  big = false,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  canEdit: boolean;
  type?: "text" | "date";
  big?: boolean;
  wide?: boolean;
}) {
  const textClass = big ? "text-lg font-black" : "text-sm font-bold";
  return (
    <div className={`flex flex-col border-b border-gray-200 pb-1${wide ? " col-span-2" : ""}`}>
      <dt className="text-[10px] font-bold text-gray-500">{label}</dt>
      <dd className={textClass}>
        {canEdit ? (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${FIELD} ${textClass}`}
          />
        ) : (
          value || "—"
        )}
      </dd>
    </div>
  );
}
