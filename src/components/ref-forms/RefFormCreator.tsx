"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Loader2, Paperclip, Printer, Save } from "lucide-react";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { submissionAttachKey } from "@/lib/submission-list";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import {
  REF_FORM_FIELD_LABEL,
  isRefFormCircle,
  isRefFormEditableText,
  normalizeRefFormEdits,
  normalizeRefFormLayout,
  pickRefFormTemplate,
  refFormCircleShown,
  refFormCircles,
  refFormInitialText,
  refFormName,
  type RefFormEdits,
  type RefFormItem,
} from "@/lib/ref-form";
import { downloadBlob } from "@/lib/onboarding-pdf";
import { useRefFormTemplates } from "./RefFormPanel";

const MIGRATION = "0230_ref_form_drafts.sql";
// 読み込むページの上限（1-17号の支援計画書のように20ページを超える様式があるので多めに）
const MAX_PAGES = 100;

interface PageView {
  width: number; // pt
  height: number; // pt
  dataUrl: string;
}

// 参考様式の作成画面（申請書類作成をアプリ一本化計画・試験中）。
// 自動で入る項目を書き込んだ PDF を下に敷き、その上に自由な文字の入力欄と○を重ねる。
// 入れた文字・動かした○は「印刷」「PDFで保存」でそのまま PDF になり、「一時保存」で
// この人の分（ref_form_drafts）に残る（まとめてダウンロードにも使われる）。
// 「所属機関の共通にする」に✓を付けた文字は、所属機関 × ひな形ごと（ref_form_org_texts）に残る
export function RefFormCreator({
  workerId,
  formKey,
  todoNo,
  fee = "",
  attachRowKey = null,
  attachLabel = "",
  nationality,
  gender,
  orgId,
  orgName,
}: {
  workerId: string;
  formKey: string;
  todoNo: string;
  fee?: string; // 紹介手数料（1-16号）。申請準備の行で入れた金額
  attachRowKey?: string | null; // 作ったPDFを添付する提出書類一覧表の行（無ければ添付のボタンを出さない）
  attachLabel?: string; // その行の名前（例: 7(1) 雇用の経緯に係る説明書）
  nationality: string;
  gender: string;
  orgId: string | null;
  orgName: string;
}) {
  const { templates, error: tplError } = useRefFormTemplates();
  const template = pickRefFormTemplate(templates, formKey, nationality, orgId);
  const layout = useMemo(() => (template ? normalizeRefFormLayout(template.layout) : []), [template]);
  // 作成画面で直せる項目: 自由な文字と、この人に付く○
  const textItems = useMemo(() => layout.filter((i) => isRefFormEditableText(i.kind)), [layout]);
  const circleItems = useMemo(
    () => layout.filter((i) => isRefFormCircle(i.kind) && refFormCircleShown(i.kind, gender)),
    [layout, gender],
  );
  const circleLabels = useMemo(() => new Map(refFormCircles(circleItems).map((c) => [c.id, c.label])), [circleItems]);

  const [loaded, setLoaded] = useState(false);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [moves, setMoves] = useState<Record<string, { x: number; y: number }>>({});
  const [off, setOff] = useState<string[]>([]);
  const [shared, setShared] = useState<string[]>([]);
  const [orgTexts, setOrgTexts] = useState<Record<string, string>>({});
  const [pages, setPages] = useState<PageView[] | null>(null);
  const [scale, setScale] = useState(1.3);
  const [busy, setBusy] = useState<null | "print" | "pdf" | "save" | "attach">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const drag = useRef<{ id: string; dx: number; dy: number; pageEl: HTMLElement } | null>(null);

  const query = useMemo(() => {
    const q = new URLSearchParams({ workerId, keys: formKey, mode: "one" });
    if (todoNo) q.set("todoNo", todoNo);
    if (fee) q.set("fee", fee);
    return q.toString();
  }, [workerId, formKey, todoNo, fee]);

  // 一時保存した分と所属機関の共通の文字を読み、入力欄の最初の値を決める
  const templateId = template?.id ?? null;
  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [d, o] = await Promise.all([
        supabase
          .from("ref_form_drafts")
          .select("template_id, texts, moves, off")
          .eq("worker_id", workerId)
          .eq("todo_no", todoNo)
          .eq("form_key", formKey)
          .maybeSingle(),
        orgId
          ? supabase.from("ref_form_org_texts").select("texts").eq("organization_id", orgId).eq("template_id", templateId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (cancelled) return;
      if (d.error || o.error) setError(dbErrorMessage(d.error ?? o.error, MIGRATION, "一時保存した内容を読めませんでした"));
      const row = d.data as { template_id: string | null; texts: unknown; moves: unknown; off: unknown } | null;
      // ひな形を差し替えた後の一時保存は位置が合わないので使わない
      const draft = row && (!row.template_id || row.template_id === templateId) ? normalizeRefFormEdits(row) : null;
      const org = normalizeRefFormEdits({ texts: (o.data as { texts: unknown } | null)?.texts }).texts;
      setOrgTexts(org);
      setTexts(Object.fromEntries(textItems.map((i) => [i.id, refFormInitialText(i, draft?.texts ?? {}, org)])));
      setMoves(draft?.moves ?? {});
      setOff(draft?.off ?? []);
      setShared(textItems.filter((i) => i.id in org).map((i) => i.id));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, workerId, todoNo, formKey, orgId, textItems]);

  // いまの入力内容（印刷・PDF・一時保存に使う）
  const edits = (): RefFormEdits => ({ texts, moves, off });

  // 下に敷く PDF: 自動で入る項目だけを書き込んだもの（自由な文字と○は画面の上に重ねて出す）
  const baseOff = useMemo(() => [...textItems, ...circleItems].map((i) => i.id), [textItems, circleItems]);
  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/ref-form", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, edits: { [formKey]: { texts: {}, moves: {}, off: baseOff } } }),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(b?.error ?? "様式を読み込めませんでした");
        }
        const buf = await res.arrayBuffer();
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
        if (!cancelled) setError(err instanceof Error ? err.message : "様式を読み込めませんでした");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, query, formKey, baseOff]);

  // いまの入力内容で PDF を作る
  async function makePdf(): Promise<Blob> {
    const res = await fetch("/api/ref-form", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, edits: { [formKey]: edits() } }),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(b?.error ?? "PDFを作れませんでした");
    }
    return res.blob();
  }

  async function onPrint() {
    setBusy("print");
    setError(null);
    setNotice(null);
    // ポップアップを止められないよう、押したときにタブを開いてから中身を入れる
    const win = window.open("", "_blank");
    try {
      const url = URL.createObjectURL(await makePdf());
      if (win) win.location.href = url;
      else window.open(url, "_blank");
      setNotice("新しいタブでPDFを開きました。そのタブで印刷してください。");
    } catch (err) {
      win?.close();
      setError(err instanceof Error ? err.message : "PDFを作れませんでした");
    } finally {
      setBusy(null);
    }
  }

  async function onPdf() {
    setBusy("pdf");
    setError(null);
    setNotice(null);
    try {
      downloadBlob(await makePdf(), `${refFormName(formKey)}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDFを作れませんでした");
    } finally {
      setBusy(null);
    }
  }

  // いまの内容で PDF を作り、申請準備の提出書類一覧表のその行に添付する（前の添付があれば差し替える）
  async function onAttach() {
    if (!attachRowKey) return;
    const docKey = submissionAttachKey(attachRowKey);
    setBusy("attach");
    setError(null);
    setNotice(null);
    try {
      const { data: prev } = await createClient()
        .from("onboarding_documents")
        .select("id")
        .eq("worker_id", workerId)
        .eq("doc_key", docKey)
        .not("storage_path", "is", null)
        .limit(1);
      if ((prev ?? []).length > 0 && !window.confirm("この行にはもう添付があります。いま作った PDF に差し替えますか？")) return;
      const blob = await makePdf();
      const file = new File([blob], `${refFormName(formKey)}.pdf`, { type: "application/pdf" });
      await uploadOnboardingDoc(workerId, { key: docKey, label: attachLabel || refFormName(formKey), num: 0 }, file);
      setNotice(`申請準備の「${attachLabel || refFormName(formKey)}」の行に添付しました。下のリンクから申請準備に戻ると、その行に出ています。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "添付できませんでした");
    } finally {
      setBusy(null);
    }
  }

  // 一時保存。共通にする所が1つも無いときは、先に確かめる
  function onSave() {
    if (orgId && textItems.length > 0 && shared.length === 0) {
      setConfirming(true);
      return;
    }
    void save();
  }

  async function save() {
    if (!template) return;
    setConfirming(false);
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      const { error: dErr } = await supabase.from("ref_form_drafts").upsert(
        { worker_id: workerId, todo_no: todoNo, form_key: formKey, template_id: template.id, texts, moves, off },
        { onConflict: "worker_id,todo_no,form_key" },
      );
      if (dErr) throw dErr;
      if (orgId) {
        // ✓を付けた所は共通の文字にし、✓を外した所は共通から外す（このひな形のほかの項目はそのまま）
        const next = { ...orgTexts };
        for (const i of textItems) {
          if (shared.includes(i.id)) next[i.id] = texts[i.id] ?? "";
          else delete next[i.id];
        }
        const { error: oErr } = await supabase
          .from("ref_form_org_texts")
          .upsert({ organization_id: orgId, template_id: template.id, texts: next }, { onConflict: "organization_id,template_id" });
        if (oErr) throw oErr;
        setOrgTexts(next);
      }
      setSavedAt(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
      setNotice(
        shared.length > 0
          ? `一時保存しました。共通にした ${shared.length} か所は、${orgName || "この所属機関"}の${refFormName(formKey)}として残ります。`
          : "一時保存しました。",
      );
    } catch (err) {
      setError(dbErrorMessage(err, MIGRATION, "一時保存に失敗しました"));
    } finally {
      setBusy(null);
    }
  }

  // ○をドラッグで動かす（pt に直して持つ）
  const posOf = (i: RefFormItem) => moves[i.id] ?? { x: i.x, y: i.y };
  // ドラッグを始める（文字のつまみ・○）。位置はページの左上から測る
  const startDrag = (e: React.PointerEvent<HTMLElement>, i: RefFormItem) => {
    e.preventDefault();
    const pageEl = e.currentTarget.closest<HTMLElement>("[data-ref-page]");
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    drag.current = {
      id: i.id,
      pageEl,
      dx: (e.clientX - rect.left) / scale - posOf(i).x,
      dy: (e.clientY - rect.top) / scale - posOf(i).y,
    };
  };
  // 入力中に Alt＋矢印キーで 1pt（Shift も押すと 5pt）ずつ動かす
  const nudge = (e: React.KeyboardEvent<HTMLInputElement>, i: RefFormItem) => {
    if (!e.altKey) return;
    const step = e.shiftKey ? 5 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const p = posOf(i);
    setMoves((m) => ({ ...m, [i.id]: { x: Math.max(0, p.x + d[0]), y: Math.max(0, p.y + d[1]) } }));
  };
  // 入力欄の幅（pt）。「最大の幅」があればそれ、無ければ入れた文字に合わせる
  const inputWidth = (i: RefFormItem, text: string) => {
    if (i.maxWidth) return i.maxWidth;
    let em = 0;
    for (const ch of text || "（空なら書きません）") em += /[\u0020-\u007e\uff61-\uff9f]/.test(ch) ? 0.6 : 1;
    return Math.max(i.size * 2, em * i.size + 4);
  };
  const resetMove = (id: string) =>
    setMoves((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const rect = d.pageEl.getBoundingClientRect();
      const x = Math.round(((e.clientX - rect.left) / scale - d.dx) * 10) / 10;
      const y = Math.round(((e.clientY - rect.top) / scale - d.dy) * 10) / 10;
      setMoves((m) => ({ ...m, [d.id]: { x: Math.max(0, x), y: Math.max(0, y) } }));
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scale]);

  const textLabel = (i: RefFormItem, n: number) => (i.text && i.text !== "（文字）" ? `${n}. ${i.text}` : `${n}. ${i.page + 1}ページ目の文字`);

  if (tplError) return <p className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">{tplError}</p>;
  if (templates.length > 0 && !template) {
    return <p className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">{refFormName(formKey)}のひな形が登録されていません。</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl border-2 border-dashed border-brand/50 bg-brand/5 px-3 py-2 text-xs leading-relaxed">
        <span className="font-black text-brand">🧪 試験中</span>
        ：自動で入る所（氏名・年齢・日付・所属機関など）は様式にそのまま出ています。赤い点線の所に文字を入れます。文字は左の赤いつまみ（⠿）、○はそのものをドラッグすると動きます（入力中は Alt＋矢印キーでも動きます）。
        直したら「この内容で作って、申請準備に添付する」（申請準備のこの様式の行に添付します）。紙で欲しいときは「印刷」「PDFで保存」、あとでまとめて PDF にするなら「一時保存」を押してください。
      </p>
      {error && <p className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">{error}</p>}

      <div className="flex flex-wrap items-start gap-4">
        {/* 左: 様式（自動で入る所を書き込んだ PDF の上に、入力欄と○を重ねる） */}
        <div className="min-w-0 flex-[999_1_640px]">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>大きさ</span>
            {[1, 1.3, 1.6].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScale(s)}
                className={`min-h-[32px] rounded-md border px-2 font-bold ${scale === s ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-brand"}`}
              >
                {Math.round(s * 100)}%
              </button>
            ))}
          </div>
          {!pages || !loaded ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" />
              様式を読み込んでいます…
            </p>
          ) : (
            <div className="flex flex-col gap-4 overflow-x-auto">
              {pages.map((p, pi) => (
                <div
                  key={pi}
                  data-ref-page
                  className="relative shrink-0 bg-white shadow"
                  style={{ width: p.width * scale, height: p.height * scale }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.dataUrl} alt={`${pi + 1}ページ目`} className="absolute inset-0 h-full w-full select-none" draggable={false} />
                  {textItems
                    .filter((i) => i.page === pi)
                    .map((i) => (
                      <div
                        key={i.id}
                        className="group absolute flex items-start"
                        style={{ left: posOf(i).x * scale, top: posOf(i).y * scale }}
                      >
                        {/* つまみ（左の外側）。入力欄の文字の始まりは PDF に書く位置のまま */}
                        <span
                          title="ドラッグで動かせます（入力中は Alt＋矢印キーでも動きます）"
                          aria-hidden="true"
                          className="absolute right-full top-0 flex h-full cursor-move touch-none select-none items-center rounded-l bg-seal px-0.5 text-[10px] leading-none text-white opacity-60 group-hover:opacity-100"
                          onPointerDown={(e) => startDrag(e, i)}
                        >
                          ⠿
                        </span>
                        <input
                          aria-label={`${pi + 1}ページ目の文字（Alt＋矢印キーで位置を動かせます）`}
                          value={texts[i.id] ?? ""}
                          onChange={(e) => setTexts((t) => ({ ...t, [i.id]: e.target.value }))}
                          onKeyDown={(e) => nudge(e, i)}
                          placeholder="（空なら書きません）"
                          className="rounded-sm border border-dashed border-seal bg-seal/5 px-0 text-black placeholder:text-seal/50"
                          style={{
                            width: inputWidth(i, texts[i.id] ?? "") * scale,
                            fontSize: i.size * scale,
                            lineHeight: 1.15,
                          }}
                        />
                      </div>
                    ))}
                  {circleItems
                    .filter((i) => i.page === pi && !off.includes(i.id))
                    .map((i) => (
                      <div
                        key={i.id}
                        title={`${circleLabels.get(i.id) ?? "○"}（ドラッグで動かせます）`}
                        className="absolute cursor-move touch-none rounded-full border-2 border-black hover:border-brand"
                        style={{
                          left: posOf(i).x * scale,
                          top: posOf(i).y * scale,
                          width: i.size * scale,
                          height: i.size * scale,
                        }}
                        onPointerDown={(e) => startDrag(e, i)}
                      />
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右: 入れた文字の一覧・○・保存 */}
        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
          {textItems.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
              <h2 className="text-sm font-bold">入力した所</h2>
              <p className="text-[11px] leading-relaxed text-muted">
                左の様式に直接入れても、ここに入れても同じです。
                {orgId ? `「${orgName || "この所属機関"}の共通にする」に✓を付けた所は、次からこの所属機関でこの様式を作るとき最初から入っています。` : ""}
              </p>
              {textItems.map((i, n) => (
                <div key={i.id} className="flex flex-col gap-1 border-t border-border pt-2">
                  <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                    {textLabel(i, n + 1)}
                    <input
                      value={texts[i.id] ?? ""}
                      onChange={(e) => setTexts((t) => ({ ...t, [i.id]: e.target.value }))}
                      placeholder="空なら何も書きません"
                      className="min-h-[36px] rounded-md border border-border px-2 text-sm font-normal text-foreground"
                    />
                  </label>
                  {moves[i.id] && (
                    <button
                      type="button"
                      onClick={() => resetMove(i.id)}
                      className="min-h-[28px] self-start rounded-md border border-border px-2 text-xs font-bold text-brand"
                    >
                      位置を元に戻す
                    </button>
                  )}
                  {orgId && (
                    <label className="inline-flex min-h-[32px] items-center gap-1.5 text-xs text-brand">
                      <input
                        type="checkbox"
                        checked={shared.includes(i.id)}
                        onChange={(e) =>
                          setShared((s) => (e.target.checked ? [...s, i.id] : s.filter((x) => x !== i.id)))
                        }
                      />
                      {orgName || "この所属機関"}の共通にする（{refFormName(formKey)}）
                    </label>
                  )}
                </div>
              ))}
            </section>
          )}

          {circleItems.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
              <h2 className="text-sm font-bold">○</h2>
              <p className="text-[11px] leading-relaxed text-muted">様式の上の○はドラッグで動かせます。要らない○はチェックを外すと書きません。</p>
              {circleItems.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="inline-flex min-h-[32px] items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={!off.includes(i.id)}
                      onChange={(e) => setOff((o) => (e.target.checked ? o.filter((x) => x !== i.id) : [...o, i.id]))}
                    />
                    {circleLabels.get(i.id) ?? REF_FORM_FIELD_LABEL[i.kind]}
                  </label>
                  {moves[i.id] && (
                    <button
                      type="button"
                      onClick={() => resetMove(i.id)}
                      className="min-h-[28px] rounded-md border border-border px-2 font-bold text-brand"
                    >
                      元の位置に戻す
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}

          <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
            <h2 className="text-sm font-bold">保存・印刷</h2>
            {/* いちばんよく使う: 確認した内容で作って、申請準備のその行に添付する */}
            {attachRowKey && (
              <button
                type="button"
                onClick={() => void onAttach()}
                disabled={busy !== null || !pages}
                className="inline-flex min-h-[52px] items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-black text-brand-foreground disabled:opacity-50"
              >
                {busy === "attach" ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                この内容で作って、申請準備に添付する
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onPrint()}
                disabled={busy !== null || !pages}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-lg border border-brand bg-surface px-3 text-sm font-bold text-brand disabled:opacity-50"
              >
                {busy === "print" ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                印刷
              </button>
              <button
                type="button"
                onClick={() => void onPdf()}
                disabled={busy !== null || !pages}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-lg border border-brand bg-surface px-3 text-sm font-bold text-brand disabled:opacity-50"
              >
                {busy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                PDFで保存
              </button>
            </div>
            <button
              type="button"
              onClick={onSave}
              disabled={busy !== null || !loaded}
              className="inline-flex min-h-[48px] items-center justify-center gap-1 rounded-lg bg-brand px-3 text-sm font-bold text-brand-foreground disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              一時保存（あとでまとめてPDFにする）
            </button>
            {savedAt && <p className="text-[11px] text-muted">{savedAt} に一時保存しました</p>}
            {notice && (
              <p role="status" className="rounded-lg bg-status-approved-bg px-3 py-2 text-xs font-bold text-status-approved-fg">
                {notice}
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted">
              一時保存した内容は、申請準備の「参考様式を一気にダウンロード」「確認せずにPDFだけ作る」にも使われます。
            </p>
            <Link
              href={`/workers/${workerId}/application-prep/unified`}
              className="text-xs font-bold text-brand underline"
            >
              申請準備へ戻る
            </Link>
          </section>
        </aside>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ref-form-confirm-title"
            className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-surface p-5 shadow-xl"
          >
            <h2 id="ref-form-confirm-title" className="text-base font-bold text-seal">
              共通にする所がありません
            </h2>
            <p className="text-sm leading-relaxed">チェックを付けていませんが、このまま保存していいですか？</p>
            <p className="text-xs leading-relaxed text-muted">
              このまま保存すると、今回入れた文字はこの人の分にだけ残ります。次に{orgName || "この所属機関"}でこの様式を作るときは、最初から入っていません。
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="min-h-[44px] rounded-lg border border-brand bg-surface px-4 text-sm font-bold text-brand"
              >
                戻ってチェックを付ける
              </button>
              <button
                type="button"
                onClick={() => void save()}
                className="min-h-[44px] rounded-lg bg-brand px-4 text-sm font-bold text-brand-foreground"
              >
                このまま保存する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
