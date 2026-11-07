"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateMunicipalityCertForm } from "@/lib/supabase/queries/tax-cert";
import { getMunicipalFormPdfUrl } from "@/app/(app)/mailing/municipal-form-actions";
import { dbErrorMessage } from "@/lib/errors";
import {
  MUNICIPAL_FORM_DOCS,
  MUNICIPAL_FORM_FIELDS,
  type MunicipalFormDoc,
  MUNICIPAL_FORM_FIELD_LABEL,
  normalizeMunicipalFormLayout,
  type MunicipalFormFieldKind,
  type MunicipalFormItem,
} from "@/lib/municipal-form";

interface PageView {
  width: number; // pt
  height: number; // pt
  dataUrl: string; // 描いた画像
}

const SAMPLE = Object.fromEntries(MUNICIPAL_FORM_FIELDS.map((f) => [f.kind, f.sample])) as Record<MunicipalFormFieldKind, string>;
const DEFAULT_SIZE: Partial<Record<MunicipalFormFieldKind, number>> = {
  check: 10,
  circle: 16,
  birth_era_circle_showa: 14,
  birth_era_circle_heisei: 14,
};
// 画面に出す見本の文字の幅のおおよそ（全角は1文字＝1em、半角は0.55em）。
// PDFと同じく「最大の幅」を超えるときは文字を小さくして見せる（切って隠さない）
function approxWidthEm(text: string): number {
  let w = 0;
  for (const ch of text) w += /[\u0020-\u007e\uff61-\uff9f]/.test(ch) ? 0.55 : 1;
  return w;
}
function fittedSize(text: string, size: number, maxWidth?: number): number {
  if (!maxWidth) return size;
  const em = approxWidthEm(text);
  return em > 0 ? Math.max(5, Math.min(size, maxWidth / em)) : size;
}

const isCircle = (k: MunicipalFormFieldKind) => k === "circle" || k === "birth_era_circle_showa" || k === "birth_era_circle_heisei";

// 自治体の申請書PDFに「どこに何を書くか」を置く画面。
// 左の項目を選んでPDFの上をクリックするとその位置に置かれ、ドラッグで動かせる。
// 位置はPDFの pt で保存するので、画面の大きさが変わってもずれない
export function MunicipalFormLayoutEditor({
  municipalityId,
  municipalityName,
  doc = "cert",
  initialLayout,
  onClose,
  onSaved,
}: {
  municipalityId: string;
  municipalityName: string;
  doc?: MunicipalFormDoc;
  initialLayout: unknown;
  onClose: () => void;
  onSaved: (layout: MunicipalFormItem[]) => void;
}) {
  const [pages, setPages] = useState<PageView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<MunicipalFormItem[]>(() => normalizeMunicipalFormLayout(initialLayout));
  const [kind, setKind] = useState<MunicipalFormFieldKind>("name");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [scale, setScale] = useState(1.3);
  const seq = useRef(0);
  const drag = useRef<{ id: string; dx: number; dy: number; page: number } | null>(null);

  // PDFを画像にして並べる（pdfjs は重いので開いたときだけ読む）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMunicipalFormPdfUrl(municipalityId, doc);
        if (!res.ok) throw new Error(res.message);
        const buf = await (await fetch(res.url)).arrayBuffer();
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        const out: PageView[] = [];
        for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
          out.push({ width: base.width, height: base.height, dataUrl: canvas.toDataURL("image/png") });
        }
        if (!cancelled) setPages(out);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "PDFを読み込めませんでした");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [municipalityId, doc]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  // 元に戻す（置く・消す・項目を変える・動かす前の状態を積む）
  const [history, setHistory] = useState<MunicipalFormItem[][]>([]);
  const remember = () => setHistory((h) => [...h.slice(-49), items]);
  const undo = () => {
    if (history.length === 0) return;
    setItems(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setSelectedId(null);
  };
  const update = (id: string, patch: Partial<MunicipalFormItem>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: string) => {
    remember();
    setItems((list) => list.filter((i) => i.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };
  const changeKind = (id: string, k: MunicipalFormFieldKind) => {
    remember();
    update(id, { kind: k, ...(k === "text" ? { text: "在留資格の手続きのため" } : {}), ...(DEFAULT_SIZE[k] ? { size: DEFAULT_SIZE[k] } : {}) });
  };

  // Delete・Backspace で選んだ項目を消す、矢印で1ptずつ動かす、Esc で選ぶのをやめる（文字の入力中は除く）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (!selectedId) return;
      const cur = items.find((i) => i.id === selectedId);
      if (!cur) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove(selectedId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = e.shiftKey ? 5 : 1;
        if (e.key === "ArrowLeft") update(cur.id, { x: cur.x - d });
        if (e.key === "ArrowRight") update(cur.id, { x: cur.x + d });
        if (e.key === "ArrowUp") update(cur.id, { y: Math.max(0, cur.y - d) });
        if (e.key === "ArrowDown") update(cur.id, { y: cur.y + d });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function addAt(page: number, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = DEFAULT_SIZE[kind] ?? 10;
    const x = (e.clientX - rect.left) / scale;
    // クリックした所が文字の左の真ん中になるように置く
    const y = (e.clientY - rect.top) / scale - size / 2;
    seq.current += 1;
    const id = `i${items.length}-${seq.current}-${Math.round(x)}-${Math.round(y)}`;
    const item: MunicipalFormItem = {
      id,
      kind,
      page,
      x: Math.round(x * 10) / 10,
      y: Math.round(Math.max(0, y) * 10) / 10,
      size,
      text: kind === "text" ? "在留資格の手続きのため" : undefined,
    };
    remember();
    setItems((list) => [...list, item]);
    setSelectedId(id);
  }

  function onPointerMove(page: number, e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.page !== page) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale - d.dx;
    const y = (e.clientY - rect.top) / scale - d.dy;
    update(d.id, { x: Math.round(Math.max(0, x) * 10) / 10, y: Math.round(Math.max(0, y) * 10) / 10 });
  }

  async function save(): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await updateMunicipalityCertForm(createClient(), municipalityId, { [MUNICIPAL_FORM_DOCS[doc].layoutCol]: items });
      onSaved(items);
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
      return true;
    } catch (err) {
      setError(dbErrorMessage(err, "0215_municipality_cert_form_pdf.sql", "保存に失敗しました"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50" role="dialog" aria-modal="true">
      <div className="flex items-center gap-2 bg-brand px-4 py-2 text-brand-foreground">
        <p className="flex-1 text-sm font-bold">
          {MUNICIPAL_FORM_DOCS[doc].label}の記入位置（{municipalityName}）
        </p>
        <button
          type="button"
          disabled={history.length === 0}
          onClick={undo}
          className="min-h-[36px] rounded-lg border border-white/60 px-3 text-xs font-bold disabled:opacity-40"
          title="ひとつ前に戻す（Ctrl+Z / ⌘+Z）"
        >
          ↶ 元に戻す
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="min-h-[36px] rounded-lg bg-white px-3 text-xs font-bold text-brand disabled:opacity-60"
        >
          {busy ? "保存中…" : "保存する"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (await save()) {
              window.open(`/api/municipal-cert-form?municipalityId=${encodeURIComponent(municipalityId)}&doc=${doc}&sample=1`, "_blank");
            }
          }}
          className="min-h-[36px] rounded-lg border border-white/60 px-3 text-xs font-bold"
        >
          保存して見本で確認
        </button>
        <button type="button" onClick={onClose} aria-label="閉じる" className="p-1">
          <X size={20} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 項目を選ぶ・選んだ項目を直す */}
        <div className="max-h-[40vh] shrink-0 overflow-y-auto border-b border-border bg-surface p-3 text-xs lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
          {selected && (
            <div className="sticky top-0 z-10 mb-3 space-y-1.5 rounded-lg border-2 border-brand bg-background p-2 shadow">
              <div className="flex items-center gap-1">
                <p className="flex-1 font-bold">選んでいる項目</p>
                <button
                  type="button"
                  onClick={() => remove(selected.id)}
                  className="rounded border border-seal bg-seal px-2 py-1 font-bold text-white"
                >
                  × 消す
                </button>
              </div>
              <label className="flex flex-col gap-0.5">
                項目（間違えたらここで変える）
                <select
                  value={selected.kind}
                  onChange={(e) => changeKind(selected.id, e.target.value as MunicipalFormFieldKind)}
                  className="min-h-[34px] rounded border border-border bg-background px-1"
                >
                  {MUNICIPAL_FORM_FIELDS.map((f) => (
                    <option key={f.kind} value={f.kind}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              {selected.kind === "text" && (
                <label className="flex flex-col gap-0.5">
                  書く文字
                  <input
                    value={selected.text ?? ""}
                    onChange={(e) => update(selected.id, { text: e.target.value })}
                    className="min-h-[34px] rounded border border-border px-2"
                  />
                </label>
              )}
              <div className="flex items-center gap-1">
                <span className="w-16">大きさ</span>
                <button type="button" className="rounded border border-border px-2" onClick={() => update(selected.id, { size: Math.max(4, selected.size - 0.5) })}>
                  −
                </button>
                <span className="w-10 text-center tabular-nums">{selected.size}</span>
                <button type="button" className="rounded border border-border px-2" onClick={() => update(selected.id, { size: Math.min(40, selected.size + 0.5) })}>
                  ＋
                </button>
              </div>
              {selected.kind !== "check" && !isCircle(selected.kind) && (
                <label className="flex items-center gap-1">
                  <span className="w-16">最大の幅</span>
                  <input
                    inputMode="numeric"
                    value={selected.maxWidth ?? ""}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      update(selected.id, { maxWidth: n > 0 ? n : undefined });
                    }}
                    placeholder="空欄＝縮めない"
                    className="min-h-[30px] w-24 rounded border border-border px-1"
                  />
                  <span className="text-muted">pt</span>
                </label>
              )}
              <div className="flex gap-1">
                <button type="button" className="rounded border border-border px-2 py-1" onClick={() => update(selected.id, { x: selected.x - 1 })}>←</button>
                <button type="button" className="rounded border border-border px-2 py-1" onClick={() => update(selected.id, { x: selected.x + 1 })}>→</button>
                <button type="button" className="rounded border border-border px-2 py-1" onClick={() => update(selected.id, { y: Math.max(0, selected.y - 1) })}>↑</button>
                <button type="button" className="rounded border border-border px-2 py-1" onClick={() => update(selected.id, { y: selected.y + 1 })}>↓</button>
                <button type="button" className="ml-auto px-1 text-muted" onClick={() => setSelectedId(null)}>
                  選ぶのをやめる
                </button>
              </div>
              <p className="text-[10px] text-muted">
                Delete キーでも消せます。矢印キーで1pt（Shift で5pt）ずつ動きます。「最大の幅」を入れると、長い住所などは枠に収まるよう小さくします。
              </p>
            </div>
          )}
          <p className="mb-1 font-bold">① 置く項目を選ぶ → ② PDFの書く場所をクリック</p>
          <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
            {MUNICIPAL_FORM_FIELDS.map((f) => (
              <button
                key={f.kind}
                type="button"
                onClick={() => setKind(f.kind)}
                className={`min-h-[34px] rounded-lg border px-2 text-left text-xs font-bold ${
                  kind === f.kind ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            置いた文字はドラッグで動かせます。押すと上に「選んでいる項目」が出て、項目を変えたり消したりできます。
            {savedAt && <span className="ml-1 font-bold text-status-approved-fg">{savedAt} に保存しました</span>}
          </p>
          {error && <p className="mt-1 rounded bg-seal/10 p-1.5 text-seal">{error}</p>}
          <div className="mt-3 flex items-center gap-1">
            <span>表示の大きさ</span>
            <button type="button" className="rounded border border-border px-2" onClick={() => setScale((s) => Math.max(0.6, s - 0.1))}>
              −
            </button>
            <button type="button" className="rounded border border-border px-2" onClick={() => setScale((s) => Math.min(2.5, s + 0.1))}>
              ＋
            </button>
          </div>
          {/* 置いた項目の一覧（押すと選ぶ・×で消す） */}
          <p className="mt-3 font-bold">置いた項目（{items.length}件）</p>
          {items.length === 0 ? (
            <p className="text-[11px] text-muted">まだありません</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {items.map((it) => (
                <li
                  key={it.id}
                  className={`flex items-center gap-1 rounded px-1 py-0.5 ${it.id === selectedId ? "bg-brand/10 font-bold" : ""}`}
                >
                  <button type="button" onClick={() => setSelectedId(it.id)} className="min-w-0 flex-1 truncate text-left">
                    {MUNICIPAL_FORM_FIELD_LABEL[it.kind]}
                    {it.kind === "text" && it.text ? `「${it.text}」` : ""}
                    {(pages?.length ?? 0) > 1 && <span className="ml-1 text-muted">{it.page + 1}枚目</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    className="shrink-0 rounded px-1.5 font-bold text-seal hover:bg-seal/10"
                    aria-label={`${MUNICIPAL_FORM_FIELD_LABEL[it.kind]}を消す`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* PDF */}
        <div className="min-h-0 flex-1 overflow-auto bg-neutral-300 p-4">
          {loadError && <p className="rounded bg-white p-3 text-sm text-seal">{loadError}</p>}
          {!pages && !loadError && <p className="rounded bg-white p-3 text-sm">PDFを読み込み中…</p>}
          {pages?.map((p, pi) => (
            <div
              key={pi}
              className="relative mx-auto mb-4 cursor-crosshair bg-white shadow"
              style={{ width: p.width * scale, height: p.height * scale }}
              onClick={(e) => {
                if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.bg === "1") addAt(pi, e);
              }}
              onPointerMove={(e) => onPointerMove(pi, e)}
              onPointerUp={() => (drag.current = null)}
              onPointerLeave={() => (drag.current = null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.dataUrl} alt={`${pi + 1}ページ目`} data-bg="1" className="pointer-events-auto absolute inset-0 h-full w-full select-none" draggable={false} />
              {items
                .filter((it) => it.page === pi)
                .map((it) => {
                  const isSel = it.id === selectedId;
                  const common = `absolute cursor-move select-none whitespace-nowrap ${isSel ? "outline outline-2 outline-brand" : "outline outline-1 outline-seal/60"}`;
                  const label = it.kind === "text" ? it.text || "（文字）" : SAMPLE[it.kind];
                  return (
                    <div
                      key={it.id}
                      title={MUNICIPAL_FORM_FIELD_LABEL[it.kind]}
                      className={`${common} ${isCircle(it.kind) ? "rounded-full" : ""} bg-seal/10 text-seal`}
                      style={{
                        left: it.x * scale,
                        top: it.y * scale,
                        fontSize: (isCircle(it.kind) ? it.size : fittedSize(label, it.size, it.maxWidth)) * scale,
                        lineHeight: 1.15,
                        ...(isCircle(it.kind) ? { width: it.size * scale, height: it.size * scale } : {}),
                        // 「最大の幅」は点線の幅で見せる（文字は上で小さくしているので切らない）
                        ...(it.maxWidth && !isCircle(it.kind) ? { minWidth: it.maxWidth * scale, outlineStyle: "dashed" as const } : {}),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(it.id);
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        remember();
                        setSelectedId(it.id);
                        const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                        drag.current = {
                          id: it.id,
                          page: pi,
                          dx: (e.clientX - rect.left) / scale - it.x,
                          dy: (e.clientY - rect.top) / scale - it.y,
                        };
                      }}
                    >
                      {isCircle(it.kind) ? "" : label}
                      {/* 選んでいる項目の上に出す小さな操作（項目名・消す） */}
                      {isSel && (
                        <span
                          className="absolute bottom-full left-0 mb-1 flex items-center gap-1 whitespace-nowrap rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold leading-normal text-brand-foreground shadow"
                          style={{ fontSize: 11 }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          {MUNICIPAL_FORM_FIELD_LABEL[it.kind]}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(it.id);
                            }}
                            className="rounded bg-seal px-1.5 text-white"
                            aria-label="この項目を消す"
                          >
                            × 消す
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
