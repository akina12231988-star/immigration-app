"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateMunicipalityCertForm } from "@/lib/supabase/queries/tax-cert";
import { getMunicipalFormPdfUrl } from "@/app/(app)/mailing/municipal-form-actions";
import { dbErrorMessage } from "@/lib/errors";
import {
  MUNICIPAL_FORM_FIELDS,
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
const DEFAULT_SIZE: Partial<Record<MunicipalFormFieldKind, number>> = { check: 10, circle: 16 };

// 自治体の申請書PDFに「どこに何を書くか」を置く画面。
// 左の項目を選んでPDFの上をクリックするとその位置に置かれ、ドラッグで動かせる。
// 位置はPDFの pt で保存するので、画面の大きさが変わってもずれない
export function MunicipalFormLayoutEditor({
  municipalityId,
  municipalityName,
  initialLayout,
  onClose,
  onSaved,
}: {
  municipalityId: string;
  municipalityName: string;
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
        const res = await getMunicipalFormPdfUrl(municipalityId);
        if (!res.ok) throw new Error(res.message);
        const buf = await (await fetch(res.url)).arrayBuffer();
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        const out: PageView[] = [];
        for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
          const page = await doc.getPage(i);
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
  }, [municipalityId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const update = (id: string, patch: Partial<MunicipalFormItem>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

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
      await updateMunicipalityCertForm(createClient(), municipalityId, { cert_form_layout: items });
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
        <p className="flex-1 text-sm font-bold">申請書の記入位置（{municipalityName}）</p>
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
              window.open(`/api/municipal-cert-form?municipalityId=${encodeURIComponent(municipalityId)}&sample=1`, "_blank");
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
            置いた文字はドラッグで動かせます。押すと下で大きさを変えたり消したりできます。
            {savedAt && <span className="ml-1 font-bold text-status-approved-fg">{savedAt} に保存しました</span>}
          </p>
          {error && <p className="mt-1 rounded bg-seal/10 p-1.5 text-seal">{error}</p>}
          {selected && (
            <div className="mt-3 space-y-1.5 rounded-lg border border-brand/40 bg-background p-2">
              <p className="font-bold">選んでいる項目: {MUNICIPAL_FORM_FIELD_LABEL[selected.kind]}</p>
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
              {selected.kind !== "check" && selected.kind !== "circle" && (
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
              <p className="text-[10px] text-muted">「最大の幅」を入れると、長い住所などは枠に収まるよう小さくします（A4の横幅は約595pt）。</p>
              <div className="flex gap-1">
                <button type="button" className="rounded border border-border px-2 py-1" onClick={() => update(selected.id, { x: selected.x - 1 })}>←</button>
                <button type="button" className="rounded border border-border px-2 py-1" onClick={() => update(selected.id, { x: selected.x + 1 })}>→</button>
                <button type="button" className="rounded border border-border px-2 py-1" onClick={() => update(selected.id, { y: selected.y - 1 })}>↑</button>
                <button type="button" className="rounded border border-border px-2 py-1" onClick={() => update(selected.id, { y: selected.y + 1 })}>↓</button>
                <button
                  type="button"
                  className="ml-auto rounded border border-seal px-2 py-1 font-bold text-seal"
                  onClick={() => {
                    setItems((list) => list.filter((i) => i.id !== selected.id));
                    setSelectedId(null);
                  }}
                >
                  消す
                </button>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-1">
            <span>表示の大きさ</span>
            <button type="button" className="rounded border border-border px-2" onClick={() => setScale((s) => Math.max(0.6, s - 0.1))}>
              −
            </button>
            <button type="button" className="rounded border border-border px-2" onClick={() => setScale((s) => Math.min(2.5, s + 0.1))}>
              ＋
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted">置いた項目: {items.length}件</p>
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
                      className={`${common} ${it.kind === "circle" ? "rounded-full" : ""} bg-seal/10 leading-none text-seal`}
                      style={{
                        left: it.x * scale,
                        top: it.y * scale,
                        fontSize: it.size * scale,
                        ...(it.kind === "circle" ? { width: it.size * scale, height: it.size * scale } : {}),
                        ...(it.maxWidth ? { maxWidth: it.maxWidth * scale, overflow: "hidden" } : {}),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(it.id);
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
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
                      {it.kind === "circle" ? "" : label}
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
