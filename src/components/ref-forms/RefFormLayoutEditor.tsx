"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLockPageScroll } from "@/hooks/useLockPageScroll";
import { getRefFormPdfUrl, saveRefFormLayout } from "@/app/(app)/ref-forms/actions";
import {
  REF_FORM_FIELDS,
  REF_FORM_DATE_FMTS,
  isRefFormPlanDate,
  refFormSampleOf,
  refFormCellWidth,
  refFormFitLines,
  refFormLineSkip,
  refFormStrikeLength,
  refFormStrikeThickness,
  REF_FORM_STRIKE_DEFAULT_LENGTH,
  REF_FORM_LINE_HEIGHT,
  type RefFormDateFmt,
  REF_FORM_FIELD_LABEL,
  REF_FORM_TEXT_PLACEHOLDER,
  isRefFormCircle,
  isRefFormMark,
  normalizeRefFormLayout,
  normalizeSignPages,
  refFormName,
  type RefFormFieldKind,
  type RefFormItem,
} from "@/lib/ref-form";

interface PageView {
  width: number; // pt
  height: number; // pt
  dataUrl: string; // 描いた画像
}

const DEFAULT_SIZE: Partial<Record<RefFormFieldKind, number>> = {
  check: 10,
  strike: 10,
  circle: 16,
  circle_male: 16,
  circle_female: 16,
  mark_monthly: 9,
  mark_daily: 9,
  mark_hourly: 9,
  p117_check_A: 10,
  p117_check_B: 10,
  p117_check_C: 10,
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

const isCircle = isRefFormCircle;
// ○と■は文字ではなく形（大きさ＝一辺）で見せる
const isShape = (k: RefFormFieldKind) => isRefFormCircle(k) || isRefFormMark(k);
// 右端のつまみをドラッグして幅（最大の幅・訂正線の長さ）を変えられる項目
const isWidthResizable = (k: RefFormFieldKind) => k === "strike" || (!isShape(k) && k !== "check" && k !== "my_number");
// 読み込むページの上限（1-17号の支援計画書のように20ページを超える様式があるので多めに）
const MAX_PAGES = 100;
// 置く項目の一覧で、まとまりの始めに出す説明
// 置く項目を、まとまり（本人・所属機関・日付…）ごとに開いたり閉じたりできる一覧にする
const FIELD_GROUPS = REF_FORM_FIELDS.filter((f) => !f.hidden).reduce<{ name: string; fields: typeof REF_FORM_FIELDS }[]>(
  (acc, f) => {
    const g = acc.find((x) => x.name === f.group);
    if (g) g.fields.push(f);
    else acc.push({ name: f.group, fields: [f] });
    return acc;
  },
  [],
);
const GROUP_NOTES: Record<string, string> = {
  支援計画書の日付: "支援計画書の日付（申請準備の詳細で保存した日付。置いたあと「書き方」で令和・西暦・年・月・日を選びます）",
  "1-6号別紙（賃金の支払）": "外国人詳細の「賃金（1-6号別紙）」で保存した内容から計算します（画面の「約〇〇円」と同じ数字）。手当は上から(a)(b)(c)(d)です。",
  "1-17号 支援計画書": "申請準備の「１－１７号の特定技能外国人支援計画書に記載する項目」と同じ値です。住居の ✓ は、選んだ住居（とできなかった場合の候補）の□にだけ付きます。",
  賃金: "賃金（外国人詳細の「賃金（1-6号別紙）」のいちばん新しい記録。■は本人の賃金の種類の□の上に置きます）",
};

// 参考様式のひな形PDFに「どこに何を書くか」と「本人の署名が要るページ」を置く画面（申請書類作成をアプリ一本化計画）。
// 自治体の申請書の記入位置（components/mailing/MunicipalFormLayoutEditor.tsx）と同じ操作で、
// 左の項目を選んでPDFの上をクリックするとその位置に置かれ、ドラッグで動かせる
export function RefFormLayoutEditor({
  templateId,
  formKey,
  language,
  initialLayout,
  initialSignPages,
  onClose,
  onSaved,
  formName,
}: {
  formName?: string; // 様式の名前（追加した様式など、refFormName で引けないとき）
  templateId: string;
  formKey: string;
  language: string;
  initialLayout: unknown;
  initialSignPages: unknown;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [signPages, setSignPages] = useState<number[]>(() => normalizeSignPages(initialSignPages));
  const [pages, setPages] = useState<PageView[] | null>(null);
  // 開いている間は下の申請準備の画面を止め、閉じたら元の位置に戻す
  useLockPageScroll();
  // PDF を並べている枠（右のページの一覧から、この枠の中だけをスクロールして移る）
  const pdfBoxRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<RefFormItem[]>(() => normalizeRefFormLayout(initialLayout));
  const [kind, setKind] = useState<RefFormFieldKind>("name");
  // 開いているまとまり（最初は「本人」だけ）
  const [openGroups, setOpenGroups] = useState<string[]>(["本人"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [scale, setScale] = useState(1.3);
  const seq = useRef(0);
  // mode "width" は右端のつまみで幅（最大の幅・訂正線の長さ）を変えているとき
  const drag = useRef<{ id: string; dx: number; dy: number; page: number; mode?: "move" | "width" } | null>(null);

  // PDFを画像にして並べる（pdfjs は重いので開いたときだけ読む）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getRefFormPdfUrl(templateId);
        if (!res.ok) throw new Error(res.message);
        const buf = await (await fetch(res.url)).arrayBuffer();
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        const out: PageView[] = [];
        for (let i = 1; i <= Math.min(pdf.numPages, MAX_PAGES); i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          // ページが多いと重くなるので、白地に描いて JPEG にする（PNG より小さい）
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
          out.push({ width: base.width, height: base.height, dataUrl: canvas.toDataURL("image/jpeg", 0.9) });
          // 読み込んだところまで先に出す（ページが多い様式でも、最初のページから置き始められる）
          if (i % 5 === 0 && !cancelled) setPages([...out]);
        }
        if (!cancelled) setPages(out);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "PDFを読み込めませんでした");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  // 元に戻す（置く・消す・項目を変える・動かす前の状態を積む）
  const [history, setHistory] = useState<RefFormItem[][]>([]);
  const remember = () => setHistory((h) => [...h.slice(-49), items]);
  const undo = () => {
    if (history.length === 0) return;
    setItems(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setSelectedId(null);
  };
  const update = (id: string, patch: Partial<RefFormItem>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: string) => {
    remember();
    setItems((list) => list.filter((i) => i.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };
  // 選んだ項目と同じ設定（項目・大きさ・最大の幅・行数・書き方など）のコピーを、少し下にずらして置く。
  // コピーを選んだ状態にするので、そのままドラッグや矢印キーで置きたい場所へ動かす
  const duplicate = (id: string) => {
    const src = items.find((i) => i.id === id);
    if (!src) return;
    seq.current += 1;
    const y = Math.round((src.y + src.size + 6) * 10) / 10;
    const copy: RefFormItem = { ...src, id: `i${items.length}-${seq.current}-c-${Math.round(src.x)}-${Math.round(y)}`, y };
    remember();
    setItems((list) => [...list, copy]);
    setSelectedId(copy.id);
  };
  const changeKind = (id: string, k: RefFormFieldKind) => {
    remember();
    update(id, { kind: k, ...(k === "text" ? { text: "" } : {}), ...(DEFAULT_SIZE[k] ? { size: DEFAULT_SIZE[k] } : {}) });
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
    const item: RefFormItem = {
      id,
      kind,
      page,
      x: Math.round(x * 10) / 10,
      y: Math.round(Math.max(0, y) * 10) / 10,
      size,
      text: kind === "text" ? "" : undefined,
      maxWidth: kind === "strike" ? REF_FORM_STRIKE_DEFAULT_LENGTH : undefined,
    };
    remember();
    setItems((list) => [...list, item]);
    setSelectedId(id);
  }

  function onPointerMove(page: number, e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.page !== page) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (d.mode === "width") {
      const cur = items.find((i) => i.id === d.id);
      if (!cur) return;
      const w = (e.clientX - rect.left) / scale - cur.x;
      update(d.id, { maxWidth: Math.round(Math.max(5, w)) });
      return;
    }
    const x = (e.clientX - rect.left) / scale - d.dx;
    const y = (e.clientY - rect.top) / scale - d.dy;
    update(d.id, { x: Math.round(Math.max(0, x) * 10) / 10, y: Math.round(Math.max(0, y) * 10) / 10 });
  }

  async function save(): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await saveRefFormLayout(templateId, items, signPages);
      if (!res.ok) throw new Error(res.message);
      onSaved();
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50" role="dialog" aria-modal="true">
      <div className="flex items-center gap-2 bg-brand px-4 py-2 text-brand-foreground">
        <p className="flex-1 text-sm font-bold">
          {formName || refFormName(formKey)}（{language}）の記入位置・署名ページ
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
              window.open(`/api/ref-form?templateId=${encodeURIComponent(templateId)}&sample=1`, "_blank");
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
                  onClick={() => duplicate(selected.id)}
                  className="rounded border border-brand bg-surface px-2 py-1 font-bold text-brand"
                  title="同じ設定のまま、もう1つ置きます（少し下に出るので、ドラッグで置きたい場所へ動かしてください）"
                >
                  ⧉ コピー
                </button>
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
                  onChange={(e) => changeKind(selected.id, e.target.value as RefFormFieldKind)}
                  className="min-h-[34px] rounded border border-border bg-background px-1"
                >
                  {REF_FORM_FIELDS.some((f) => f.hidden && f.kind === selected.kind) && (
                    <option value={selected.kind}>{REF_FORM_FIELD_LABEL[selected.kind]}</option>
                  )}
                  {FIELD_GROUPS.map((g) => (
                    <optgroup key={g.name} label={g.name}>
                      {g.fields.map((f) => (
                        <option key={f.kind} value={f.kind}>
                          {f.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {isRefFormPlanDate(selected.kind) && (
                <label className="flex flex-col gap-0.5">
                  書き方（申請準備の「支援計画書の日付」から入ります）
                  <select
                    value={selected.fmt ?? "seireki"}
                    onChange={(e) => {
                      remember();
                      update(selected.id, { fmt: e.target.value as RefFormDateFmt });
                    }}
                    className="min-h-[34px] rounded border border-border bg-background px-1"
                  >
                    {REF_FORM_DATE_FMTS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.kind === "text" && (
                <label className="flex flex-col gap-0.5">
                  書く文字
                  <input
                    value={selected.text === REF_FORM_TEXT_PLACEHOLDER ? "" : (selected.text ?? "")}
                    placeholder="空のままなら PDF には何も書きません"
                    onChange={(e) => update(selected.id, { text: e.target.value })}
                    className="min-h-[34px] rounded border border-border px-2"
                  />
                </label>
              )}
              {isCircle(selected.kind) && (
                <label className="flex flex-col gap-0.5">
                  名前（PDFを作るときに外すかを選ぶ欄に出ます）
                  <input
                    value={selected.text ?? ""}
                    placeholder="例: ③性別の男"
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
              {selected.kind === "my_number" && (
                <label className="flex items-center gap-1">
                  <span className="w-16">マスの幅</span>
                  <input
                    type="number"
                    step={0.1}
                    min={1}
                    value={selected.cell ?? ""}
                    placeholder={String(refFormCellWidth(selected))}
                    onChange={(e) => update(selected.id, { cell: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })}
                    className="min-h-[30px] w-24 rounded border border-border px-1"
                  />
                  <span className="text-muted">pt（様式の1マスの幅に合わせる。最初のマスの左端に置く）</span>
                </label>
              )}
              {selected.kind !== "check" && selected.kind !== "my_number" && !isShape(selected.kind) && (
                <label className="flex items-center gap-1">
                  <span className="w-16">{selected.kind === "strike" ? "長さ" : "最大の幅"}</span>
                  <input
                    inputMode="numeric"
                    value={selected.maxWidth ?? ""}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      update(selected.id, { maxWidth: n > 0 ? n : undefined });
                    }}
                    placeholder={selected.kind === "strike" ? String(REF_FORM_STRIKE_DEFAULT_LENGTH) : "空欄＝縮めない"}
                    className="min-h-[30px] w-24 rounded border border-border px-1"
                  />
                  <span className="text-muted">pt（PDF の上の右端の■をドラッグしても変えられます）</span>
                </label>
              )}
              {selected.maxWidth && selected.kind !== "my_number" && selected.kind !== "strike" && !isShape(selected.kind) && (
                <label className="flex items-center gap-1">
                  <span className="w-16">行数</span>
                  <select
                    value={selected.maxLines ?? 1}
                    onChange={(e) => {
                      remember();
                      const n = Number(e.target.value);
                      update(selected.id, { maxLines: n >= 2 ? n : undefined });
                    }}
                    className="min-h-[30px] rounded border border-border bg-background px-1"
                  >
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? "1行（入らなければ小さく）" : `${n}行まで折り返す`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.maxWidth && selected.kind !== "my_number" && selected.kind !== "strike" && !isShape(selected.kind) && (
                <label className="flex items-center gap-1">
                  <span className="w-16 leading-tight">入らないとき</span>
                  <select
                    value={selected.noShrink ? "keep" : "shrink"}
                    onChange={(e) => {
                      remember();
                      update(selected.id, { noShrink: e.target.value === "keep" ? true : undefined });
                    }}
                    className="min-h-[30px] rounded border border-border bg-background px-1"
                  >
                    <option value="shrink">文字を小さくして幅に収める</option>
                    <option value="keep">文字の大きさは変えない（はみ出す）</option>
                  </select>
                </label>
              )}
              {selected.maxWidth && (selected.maxLines ?? 1) > 1 && selected.kind !== "my_number" && selected.kind !== "strike" && !isShape(selected.kind) && (
                <label className="flex items-center gap-1">
                  <span className="w-16 leading-tight">短いとき</span>
                  <select
                    value={selected.valign ?? "top"}
                    onChange={(e) => {
                      remember();
                      update(selected.id, { valign: e.target.value === "bottom" ? "bottom" : undefined });
                    }}
                    className="min-h-[30px] rounded border border-border bg-background px-1"
                  >
                    <option value="top">上の行に書く</option>
                    <option value="bottom">下の行に書く（下段に寄せる）</option>
                  </select>
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
                Delete キーでも消せます。「⧉ コピー」で同じ設定のものをもう1つ置けます（少し下に出るので、ドラッグで動かす）。右端の■をドラッグすると最大の幅（訂正線は長さ）が変わります。矢印キーで1pt（Shift で5pt）ずつ動きます。「最大の幅」を入れると、長い住所などは枠に収まるよう小さくします（「入らないとき」で、小さくしないこともできます）。
              </p>
            </div>
          )}
          <p className="mb-1 font-bold">① 置く項目を選ぶ → ② PDFの書く場所をクリック</p>
          <div className="flex flex-col gap-1">
            {FIELD_GROUPS.map((g) => {
              const open = openGroups.includes(g.name);
              const hasSelected = g.fields.some((f) => f.kind === kind);
              return (
                <div key={g.name} className="rounded-lg border border-border">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenGroups((o) => (open ? o.filter((x) => x !== g.name) : [...o, g.name]))}
                    className={`flex min-h-[36px] w-full items-center gap-1 rounded-lg px-2 text-left text-xs font-bold ${hasSelected ? "bg-brand/10 text-brand" : "bg-surface"}`}
                  >
                    <span className="w-3 shrink-0 text-muted">{open ? "▾" : "▸"}</span>
                    <span className="flex-1">{g.name}</span>
                    <span className="text-[10px] font-normal text-muted">{g.fields.length}</span>
                  </button>
                  {open && (
                    <div className="grid grid-cols-2 gap-1 px-1.5 pb-1.5 lg:grid-cols-1">
                      {GROUP_NOTES[g.name] && <p className="col-span-full text-[10px] text-muted">{GROUP_NOTES[g.name]}</p>}
                      {g.fields.map((f) => (
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
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            右のページの一覧で「✍ 署名」にチェックしたページが、署名ページだけのダウンロードに入ります（全ページなら「✍ 全ページ」）。
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
                    {REF_FORM_FIELD_LABEL[it.kind]}
                    {it.kind === "text" && it.text ? `「${it.text}」` : ""}
                    {(pages?.length ?? 0) > 1 && <span className="ml-1 text-muted">{it.page + 1}枚目</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    className="shrink-0 rounded px-1.5 font-bold text-seal hover:bg-seal/10"
                    aria-label={`${REF_FORM_FIELD_LABEL[it.kind]}を消す`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* PDF */}
        <div ref={pdfBoxRef} className="min-h-0 flex-1 overflow-auto bg-neutral-300 p-4">
          {loadError && <p className="rounded bg-white p-3 text-sm text-seal">{loadError}</p>}
          {!pages && !loadError && <p className="rounded bg-white p-3 text-sm">PDFを読み込み中…</p>}
          {pages?.map((p, pi) => (
            <div key={pi} id={`ref-layout-page-${pi}`} className="mx-auto mb-4 scroll-mt-2" style={{ width: p.width * scale }}>
            {/* 署名ページかどうかは右のページの一覧で選ぶ。ここはページ番号と印だけ */}
            <p
              className={`mb-1 inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
                signPages.includes(pi) ? "bg-seal text-white" : "bg-white text-foreground"
              }`}
            >
              {pi + 1}ページ目{signPages.includes(pi) ? "（✍ 署名ページ）" : ""}
            </p>
            <div
              className="relative cursor-crosshair bg-white shadow"
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
                  const label = it.kind === "text" ? it.text || REF_FORM_TEXT_PLACEHOLDER : it.kind === "strike" ? "" : refFormSampleOf(it);
                  const strike = it.kind === "strike";
                  // 最大の幅・行数があれば、PDF と同じように折り返して（入らなければ小さくして）見せる
                  const fit = !isShape(it.kind) && !strike && it.kind !== "my_number" && it.maxWidth && (it.maxLines ?? 1) > 1
                    ? refFormFitLines(label, it, (t, sz) => approxWidthEm(t) * sz)
                    : null;
                  return (
                    <div
                      key={it.id}
                      title={REF_FORM_FIELD_LABEL[it.kind]}
                      className={`${common} ${isCircle(it.kind) ? "rounded-full" : ""} ${isRefFormMark(it.kind) ? "bg-seal/70" : strike ? "" : "bg-seal/10"} text-seal`}
                      style={{
                        left: it.x * scale,
                        top: it.y * scale,
                        fontSize: (isShape(it.kind) ? it.size : fit ? fit.size : it.noShrink ? it.size : fittedSize(label, it.size, it.maxWidth)) * scale,
                        lineHeight: fit ? REF_FORM_LINE_HEIGHT : 1.15,
                        ...(fit ? { whiteSpace: "pre" as const } : {}),
                        // 折り返す行数ぶんの高さの枠を出し、2行目以降がどこに来るかを見せる
                        ...(fit ? { minHeight: (it.maxLines ?? 1) * fit.size * REF_FORM_LINE_HEIGHT * scale } : {}),
                        ...(isShape(it.kind) ? { width: it.size * scale, height: it.size * scale } : {}),
                        // 「最大の幅」は点線の幅で見せる（文字は上で小さくしているので切らない）
                        ...(it.maxWidth && !isShape(it.kind) && !strike ? { minWidth: it.maxWidth * scale, outlineStyle: "dashed" as const } : {}),
                        // 訂正線は長さ×大きさの枠の真ん中に線を引いて見せる
                        ...(strike ? { width: refFormStrikeLength(it) * scale, height: it.size * scale } : {}),
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
                          mode: "move",
                          dx: (e.clientX - rect.left) / scale - it.x,
                          dy: (e.clientY - rect.top) / scale - it.y,
                        };
                      }}
                    >
                      {strike ? (
                        <span
                          className="absolute left-0 right-0 top-1/2 block -translate-y-1/2 bg-seal"
                          style={{ height: Math.max(1, refFormStrikeThickness(it) * scale) }}
                        />
                      ) : isShape(it.kind) ? (
                        ""
                      ) : it.kind === "my_number" ? (
                        // 個人番号は1マスに1文字。マスの幅で並べて、様式のマスと合っているかを見られるようにする
                        <span className="flex">
                          {[...label].map((ch, n) => (
                            <span
                              key={n}
                              className="inline-block border-r border-seal/30 text-center last:border-r-0"
                              style={{ width: refFormCellWidth(it) * scale }}
                            >
                              {ch}
                            </span>
                          ))}
                        </span>
                      ) : fit ? (
                        // 書く行はそのまま、空いている行は「（2行目）」を薄く出す（PDF には書かない）。
                        // 下の行に寄せる項目は、空く行を上に出す
                        (() => {
                          const skip = refFormLineSkip(it, fit.lines.length);
                          return Array.from({ length: Math.max(fit.lines.length + skip, it.maxLines ?? 1) }, (_, n) => {
                            const line = n >= skip ? fit.lines[n - skip] : undefined;
                            return (
                              <span
                                key={n}
                                className={`block ${n > 0 ? "border-t border-dotted border-seal/40" : ""} ${line != null ? "" : "text-seal/35"}`}
                              >
                                {line ?? `（${n + 1}行目）`}
                              </span>
                            );
                          });
                        })()
                      ) : (
                        label
                      )}
                      {/* 右端のつまみ。ドラッグして幅（最大の幅・訂正線の長さ）を変える */}
                      {isSel && isWidthResizable(it.kind) && (
                        <span
                          role="slider"
                          aria-label={strike ? "訂正線の長さ" : "最大の幅"}
                          aria-valuenow={it.maxWidth ?? 0}
                          title={strike ? "ドラッグして長さを変える" : "ドラッグして最大の幅を決める"}
                          className="absolute top-1/2 block h-3.5 w-3.5 -translate-y-1/2 cursor-ew-resize rounded-sm border-2 border-white bg-brand shadow"
                          style={{ right: -8 }}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            remember();
                            drag.current = { id: it.id, page: pi, dx: 0, dy: 0, mode: "width" };
                          }}
                        />
                      )}
                      {/* 選んでいる項目の上に出す小さな操作（項目名・消す） */}
                      {isSel && (
                        <span
                          className="absolute bottom-full left-0 mb-1 flex items-center gap-1 whitespace-nowrap rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold leading-normal text-brand-foreground shadow"
                          style={{ fontSize: 11 }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          {REF_FORM_FIELD_LABEL[it.kind]}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicate(it.id);
                            }}
                            className="rounded bg-surface px-1.5 text-brand"
                            aria-label="この項目を同じ設定でコピーする"
                          >
                            ⧉ コピー
                          </button>
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
            </div>
          ))}
        </div>

        {/* 右のページの一覧（PDF のサムネイルのように）。押すとそのページへ移り、チェックで署名ページを選ぶ */}
        {pages && pages.length > 0 && (
          <div className="max-h-[30vh] shrink-0 overflow-y-auto border-t border-border bg-surface p-2 text-[11px] lg:max-h-none lg:w-40 lg:border-l lg:border-t-0">
            <p className="mb-1 font-bold">ページ（{pages.length}）</p>
            <p className="mb-1 leading-snug text-muted">
              ✍ にチェックしたページが「署名ページだけ」のダウンロードに入ります（{signPages.length}ページ）
            </p>
            {/* 全ページが署名ページの様式（確認書など）は、まとめてチェック・外す */}
            <label
              className={`mb-2 flex items-center gap-1 rounded border px-1.5 py-1 font-bold ${
                signPages.length === pages.length ? "border-seal bg-seal text-white" : "border-border bg-background"
              }`}
            >
              <input
                type="checkbox"
                checked={signPages.length === pages.length}
                ref={(el) => {
                  if (el) el.indeterminate = signPages.length > 0 && signPages.length < pages.length;
                }}
                onChange={(e) => setSignPages(e.target.checked ? pages.map((_, i) => i) : [])}
                className="h-3.5 w-3.5"
              />
              ✍ 全ページ
            </label>
            {pages.map((p, pi) => {
              const sign = signPages.includes(pi);
              return (
                <div key={pi} className="mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      // scrollIntoView は下の画面までスクロールしてしまうので、PDF の枠の中だけを動かす
                      const box = pdfBoxRef.current;
                      const el = document.getElementById(`ref-layout-page-${pi}`);
                      if (box && el) {
                        const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
                        box.scrollTo({ top, behavior: "smooth" });
                      }
                    }}
                    className={`block w-full overflow-hidden rounded border-2 bg-white ${sign ? "border-seal" : "border-border hover:border-brand"}`}
                    title={`${pi + 1}ページ目へ移る`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt={`${pi + 1}ページ目のサムネイル`} className="block w-full" draggable={false} />
                  </button>
                  <label className={`mt-0.5 flex items-center justify-center gap-1 rounded px-1 py-0.5 font-bold ${sign ? "bg-seal text-white" : ""}`}>
                    <input
                      type="checkbox"
                      checked={sign}
                      onChange={(e) =>
                        setSignPages((cur) => (e.target.checked ? [...cur, pi].sort((a, b) => a - b) : cur.filter((x) => x !== pi)))
                      }
                      className="h-3.5 w-3.5"
                    />
                    {pi + 1}　✍ 署名
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
