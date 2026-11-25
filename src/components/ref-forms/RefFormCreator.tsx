"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Eye, Loader2, Paperclip, Printer, Save } from "lucide-react";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { submissionAttachKey } from "@/lib/submission-list";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import {
  REF_FORM_FIELD_LABEL,
  clampRefFormSize,
  isRefFormCircle,
  isRefFormMark,
  refFormMovesForSave,
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
import { saveRefFormLayout } from "@/app/(app)/ref-forms/actions";
import { WorkerCardCheckPanel } from "./WorkerCardCheckPanel";
import { SupportRosterPicker } from "./SupportRosterPicker";

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
  embedded = false,
  reloadSignal = 0,
  sidePanel,
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
  // まとめて確認する画面の中で使うとき（説明と「在留カードで確かめる」はその画面に1つだけ出す）
  embedded?: boolean;
  reloadSignal?: number; // 変わったら様式を作り直す（まとめて確認する画面で本人の情報を直したとき）
  sidePanel?: React.ReactNode; // embedded のとき、右の欄の下に出すもの（まとめて確認する画面の「在留カードで確かめる」）
  nationality: string;
  gender: string;
  orgId: string | null;
  orgName: string;
}) {
  const { templates, error: tplError, reload: reloadTemplates } = useRefFormTemplates();
  const template = pickRefFormTemplate(templates, formKey, nationality, orgId);
  const layout = useMemo(() => (template ? normalizeRefFormLayout(template.layout) : []), [template]);
  // 作成画面で直せる項目: 自由な文字と、この人に付く○・✓（○と✓は動かす・外すことができる）
  const textItemsNow = useMemo(() => layout.filter((i) => isRefFormEditableText(i.kind)), [layout]);
  // ひな形の文字の大きさだけを変えたとき（全員の分にする）に、入れている文字を読み直さないよう、
  // 項目の顔ぶれ（ID・最初の文字）が変わったときだけ作り直す
  const textItemsKey = textItemsNow.map((i) => `${i.id}:${i.text ?? ""}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const textItems = useMemo(() => textItemsNow, [textItemsKey]);
  const circleItems = useMemo(
    () => layout.filter((i) => (isRefFormCircle(i.kind) && refFormCircleShown(i.kind, gender)) || i.kind === "check"),
    [layout, gender],
  );
  // 自動で入る文字（氏名・生年月日・所属機関など）。文字の大きさだけこの画面で変えられる
  const autoTextItems = useMemo(
    () =>
      layout.filter(
        (i) =>
          !isRefFormEditableText(i.kind) &&
          !isRefFormCircle(i.kind) &&
          !isRefFormMark(i.kind) &&
          i.kind !== "check" &&
          i.kind !== "strike" &&
          !i.kind.startsWith("p117_check_"),
      ),
    [layout],
  );
  const circleLabels = useMemo(() => {
    const m = new Map(refFormCircles(circleItems).map((c) => [c.id, c.label]));
    // ✓ は「1ページ目の✓（2個目）」（名前を付けていればその名前）
    const perPage = new Map<number, number>();
    for (const c of circleItems
      .filter((i) => i.kind === "check")
      .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)) {
      const n = (perPage.get(c.page) ?? 0) + 1;
      perPage.set(c.page, n);
      m.set(c.id, (c.text ?? "").trim() || `${c.page + 1}ページ目の✓（${n}個目）`);
    }
    return m;
  }, [circleItems]);

  const [loaded, setLoaded] = useState(false);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [moves, setMoves] = useState<Record<string, { x: number; y: number }>>({});
  // この人の分だけ変えた文字の大きさ（pt）。自動で入る文字は下に敷く PDF を作り直して見せる
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [bgSizes, setBgSizes] = useState<Record<string, number>>({});
  // 文字の大きさの一覧（長いので、最初はたたんでおく）
  const [showSizes, setShowSizes] = useState(false);
  const [off, setOff] = useState<string[]>([]);
  const [shared, setShared] = useState<string[]>([]);
  const [orgTexts, setOrgTexts] = useState<Record<string, string>>({});
  const [pages, setPages] = useState<PageView[] | null>(null);
  const [scale, setScale] = useState(1.3);
  const [busy, setBusy] = useState<null | "print" | "pdf" | "save" | "attach" | "check">(null);
  // 「内容確認」で作った PDF（プレビュー）と、「はい」で確かめた PDF。key は作ったときの直した内容（変わったら確認し直し）
  const [preview, setPreview] = useState<{ url: string; blob: Blob; key: string } | null>(null);
  const [confirmed, setConfirmed] = useState<{ blob: Blob; key: string } | null>(null);
  // 本人の情報を直したときに、下に敷く PDF（自動で入る所）を作り直すためのキー
  const [reloadKey, setReloadKey] = useState(0);
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
      setSizes(draft?.sizes ?? {});
      setBgSizes(draft?.sizes ?? {});
      setOff(draft?.off ?? []);
      setShared(textItems.filter((i) => i.id in org).map((i) => i.id));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, workerId, todoNo, formKey, orgId, textItems]);

  // いまの入力内容（印刷・PDF・一時保存に使う）
  const edits = (): RefFormEdits => ({ texts, moves, off, sizes });
  const sizeOf = (i: RefFormItem) => sizes[i.id] ?? i.size;
  const setSize = (i: RefFormItem, n: number | null) =>
    setSizes((m) => {
      const next = { ...m };
      if (n == null || clampRefFormSize(n) === i.size) delete next[i.id];
      else next[i.id] = clampRefFormSize(n);
      return next;
    });
  // 変えた大きさを、このひな形（全員の分）の大きさにする。この人の分の変更は消す（ひな形と同じになるので）
  const [savingTpl, setSavingTpl] = useState(false);
  async function applySizesToTemplate() {
    if (!template || Object.keys(sizes).length === 0) return;
    const who = template.organization_id ? `${orgName || "この所属機関"}の版` : "全員共通の版";
    if (
      !window.confirm(
        `いま変えた文字の大きさ（${Object.keys(sizes).length}か所）を、${refFormName(formKey)}（${template.language}・${who}）のひな形の大きさにします。\n次からこのひな形で作る全員の分がこの大きさになります。よろしいですか？`,
      )
    )
      return;
    setSavingTpl(true);
    setError(null);
    setNotice(null);
    try {
      const next = normalizeRefFormLayout(template.layout).map((i) => (sizes[i.id] ? { ...i, size: sizes[i.id] } : i));
      const res = await saveRefFormLayout(template.id, next, template.sign_pages);
      if (!res.ok) throw new Error(res.message);
      // この人の一時保存に残っている大きさも消す（ひな形の大きさを使う）
      await createClient()
        .from("ref_form_drafts")
        .update({ moves: refFormMovesForSave(moves, {}) })
        .eq("worker_id", workerId)
        .eq("todo_no", todoNo)
        .eq("form_key", formKey);
      setSizes({});
      setBgSizes({});
      await reloadTemplates();
      setNotice(`文字の大きさを${refFormName(formKey)}のひな形（${who}）に保存しました。次からこの大きさで作られます。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ひな形に保存できませんでした");
    } finally {
      setSavingTpl(false);
    }
  }

  // 自動で入る文字の大きさを変えたら、少し待ってから下に敷く PDF を作り直す（押すたびに作り直さない）
  const autoIds = useMemo(() => new Set(autoTextItems.map((i) => i.id)), [autoTextItems]);
  const autoSizesKey = JSON.stringify(Object.fromEntries(Object.entries(sizes).filter(([k]) => autoIds.has(k))));
  useEffect(() => {
    const t = setTimeout(() => setBgSizes(JSON.parse(autoSizesKey) as Record<string, number>), 500);
    return () => clearTimeout(t);
  }, [autoSizesKey]);

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
          body: JSON.stringify({ query, edits: { [formKey]: { texts: {}, moves: {}, off: baseOff, sizes: bgSizes } } }),
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
  }, [templateId, query, formKey, baseOff, reloadKey, reloadSignal, bgSizes]);

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

  // 直した内容が同じか（確認したあとに直したら、もう一度確認してもらう）
  const editsKey = JSON.stringify({ texts, moves, off, sizes });
  const isConfirmed = !!confirmed && confirmed.key === editsKey;
  // 確認した PDF があればそれを使い、無ければ作る
  const getPdf = async (): Promise<Blob> => (confirmed && confirmed.key === editsKey ? confirmed.blob : makePdf());

  // 「内容確認」: いまの内容で PDF を作って、画面の上で見せる
  async function onCheck() {
    setBusy("check");
    setError(null);
    setNotice(null);
    try {
      const blob = await makePdf();
      if (preview) URL.revokeObjectURL(preview.url);
      setPreview({ url: URL.createObjectURL(blob), blob, key: editsKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDFを作れませんでした");
    } finally {
      setBusy(null);
    }
  }
  const closePreview = (ok: boolean) => {
    if (preview && ok) setConfirmed({ blob: preview.blob, key: preview.key });
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  async function onPrint() {
    setBusy("print");
    setError(null);
    setNotice(null);
    // ポップアップを止められないよう、押したときにタブを開いてから中身を入れる
    const win = window.open("", "_blank");
    try {
      const url = URL.createObjectURL(await getPdf());
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
      downloadBlob(await getPdf(), `${refFormName(formKey)}.pdf`);
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
      const blob = await getPdf();
      const file = new File([blob], `${refFormName(formKey)}.pdf`, { type: "application/pdf" });
      await uploadOnboardingDoc(workerId, { key: docKey, label: attachLabel || refFormName(formKey), num: 0 }, file);
      // 直した内容（入れた文字・動かした位置・外した○✓）も一時保存しておく。
      // 次に開いたときやまとめてダウンロードでも、外した✓などがそのまま使われるように
      if (template) {
        const { error: dErr } = await createClient().from("ref_form_drafts").upsert(
          { worker_id: workerId, todo_no: todoNo, form_key: formKey, template_id: template.id, texts, moves: refFormMovesForSave(moves, sizes), off },
          { onConflict: "worker_id,todo_no,form_key" },
        );
        if (dErr) throw new Error(dbErrorMessage(dErr, MIGRATION, "添付はしましたが、直した内容の一時保存に失敗しました"));
        setSavedAt(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
      }
      setNotice(`申請準備の「${attachLabel || refFormName(formKey)}」の行に添付しました（直した内容も一時保存しました）。下のリンクから申請準備に戻ると、その行に出ています。`);
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
        { worker_id: workerId, todo_no: todoNo, form_key: formKey, template_id: template.id, texts, moves: refFormMovesForSave(moves, sizes), off },
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
    return Math.max(sizeOf(i) * 2, em * sizeOf(i) + 4);
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
{!embedded && (
      <p className="rounded-xl border-2 border-dashed border-brand/50 bg-brand/5 px-3 py-2 text-xs leading-relaxed">
        <span className="font-black text-brand">🧪 試験中</span>
        ：自動で入る所（氏名・年齢・日付・所属機関など）は様式にそのまま出ています。赤い点線の所に文字を入れます。文字は左の赤いつまみ（⠿）、○はそのものをドラッグすると動きます（入力中は Alt＋矢印キーでも動きます）。
        直したら「内容確認」でできあがりの PDF を見て、「はい」を押してから「この内容で作って、申請準備に添付する」（申請準備のこの様式の行に添付します）・「印刷」・「PDFで保存」を選びます。あとでまとめて PDF にするなら「一時保存」を押してください。
      </p>
      )}
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
                            fontSize: sizeOf(i) * scale,
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
                        title={`${circleLabels.get(i.id) ?? "○"}（ドラッグで動かせます。✕で外します）`}
                        className={`group absolute cursor-move touch-none ${
                          i.kind === "check" ? "hover:outline hover:outline-1 hover:outline-brand" : "rounded-full border-2 border-black hover:border-brand"
                        }`}
                        style={{
                          left: posOf(i).x * scale,
                          top: posOf(i).y * scale,
                          width: i.size * scale,
                          height: i.size * scale,
                        }}
                        onPointerDown={(e) => startDrag(e, i)}
                      >
                        {/* ✓ は PDF と同じ形の線で描く */}
                        {i.kind === "check" && (
                          <svg viewBox="0 0 10 10" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                            <polyline points="0,4.5 3.5,10 10,0" fill="none" stroke="black" strokeWidth={Math.max(1, i.size / 8) * (10 / i.size)} />
                          </svg>
                        )}
                        {/* 押すとこの○・✓を外す（右の一覧のチェックを外すのと同じ） */}
                        <button
                          type="button"
                          aria-label="この印を外す"
                          title="この印を外す（右の一覧で戻せます）"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOff((o) => (o.includes(i.id) ? o : [...o, i.id]));
                          }}
                          className="absolute -right-3 -top-3 hidden h-5 w-5 items-center justify-center rounded-full bg-seal text-[11px] font-bold leading-none text-white shadow group-hover:flex"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右: 入れた文字の一覧・○・保存 */}
        {/* 様式を下へスクロールしても、保存・印刷と在留カードの欄がついてくる（欄が長いときはこの中だけスクロール） */}
        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-3 lg:sticky lg:top-[80px] lg:max-h-[calc(100vh-92px)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {/* 保存・印刷（右の欄のいちばん上。入力した所や文字の大きさの一覧が長くても、すぐ押せる） */}
          <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
            <h2 className="text-sm font-bold">保存・印刷</h2>
            {/* まず「内容確認」で PDF を見て、「はい」と答えたら添付・印刷・PDFで保存ができる */}
            {!isConfirmed ? (
              <>
                <button
                  type="button"
                  onClick={() => void onCheck()}
                  disabled={busy !== null || !pages}
                  className="inline-flex min-h-[52px] items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-black text-brand-foreground disabled:opacity-50"
                >
                  {busy === "check" ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                  内容確認
                </button>
                <p className="text-[11px] leading-relaxed text-muted">
                  {confirmed
                    ? "確認したあとに内容を直したので、もう一度「内容確認」を押してください。"
                    : "できあがりの PDF を見て「はい」を押すと、申請準備への添付・印刷・PDFで保存ができます。"}
                </p>
              </>
            ) : (
              <>
                <p className="rounded-lg bg-status-approved-bg px-2 py-1.5 text-xs font-bold text-status-approved-fg">✓ 内容を確認しました。この内容で、添付・印刷・PDFで保存ができます。</p>
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
                <button type="button" onClick={() => void onCheck()} disabled={busy !== null} className="self-start text-xs font-bold text-brand underline">
                  もう一度内容確認する
                </button>
              </>
            )}
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
              一時保存した内容は、申請準備の「参考様式を一気にダウンロード」にも使われます。
            </p>
            <Link
              href={`/workers/${workerId}/application-prep/unified`}
              className="text-xs font-bold text-brand underline"
            >
              申請準備へ戻る
            </Link>
          </section>
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

          {/* 文字の大きさ（この人の分だけ。ひな形そのものの大きさは「ひな形・記入位置」で変える） */}
          {autoTextItems.length + textItems.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSizes((v) => !v)}
                  aria-expanded={showSizes}
                  className="text-sm font-bold"
                >
                  {showSizes ? "▾" : "▸"} 文字の大きさ
                  {Object.keys(sizes).length > 0 && <span className="ml-1 text-xs text-brand">（{Object.keys(sizes).length}か所 変更中）</span>}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSizes(
                      Object.fromEntries(
                        [...autoTextItems, ...textItems].map((i) => [i.id, clampRefFormSize(sizeOf(i) - 0.5)]),
                      ),
                    )
                  }
                  className="min-h-[28px] rounded-md border border-brand px-2 text-xs font-bold text-brand"
                >
                  全部 0.5pt 小さく
                </button>
                {Object.keys(sizes).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSizes({})}
                    className="min-h-[28px] rounded-md border border-border px-2 text-xs font-bold text-muted"
                  >
                    全部元に戻す
                  </button>
                )}
                {Object.keys(sizes).length > 0 && (
                  <button
                    type="button"
                    onClick={() => void applySizesToTemplate()}
                    disabled={savingTpl}
                    className="inline-flex min-h-[28px] items-center gap-1 rounded-md bg-brand px-2 text-xs font-bold text-brand-foreground disabled:opacity-60"
                  >
                    {savingTpl && <Loader2 size={12} className="animate-spin" />}
                    この大きさを全員の分（ひな形）にする
                  </button>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                変えた大きさは、まずこの人の分だけに効きます（一時保存・添付・印刷に入ります）。全員の分も同じにするときは「この大きさを全員の分（ひな形）にする」を押してください。自動で入る文字は、少し待つと左の様式に出ます。
              </p>
              {showSizes && [...autoTextItems.map((i) => ({ i, label: `${REF_FORM_FIELD_LABEL[i.kind] ?? i.kind}（${i.page + 1}ページ目）` })), ...textItems.map((i, n) => ({ i, label: textLabel(i, n + 1) }))]
                .sort((a, b) => a.i.page - b.i.page || a.i.y - b.i.y || a.i.x - b.i.x)
                .map(({ i, label }) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={`min-w-0 flex-1 truncate ${sizes[i.id] ? "font-bold text-brand" : ""}`} title={label}>
                      {label}
                    </span>
                    <button
                      type="button"
                      aria-label={`${label}を小さく`}
                      onClick={() => setSize(i, sizeOf(i) - 0.5)}
                      className="h-8 w-8 rounded-md border border-border font-bold"
                    >
                      －
                    </button>
                    <span className="w-12 text-center tabular-nums">{sizeOf(i)}pt</span>
                    <button
                      type="button"
                      aria-label={`${label}を大きく`}
                      onClick={() => setSize(i, sizeOf(i) + 0.5)}
                      className="h-8 w-8 rounded-md border border-border font-bold"
                    >
                      ＋
                    </button>
                    {sizes[i.id] != null && (
                      <button type="button" onClick={() => setSize(i, null)} className="text-[11px] font-bold text-muted underline">
                        元（{i.size}pt）
                      </button>
                    )}
                  </div>
                ))}
            </section>
          )}

          {circleItems.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
              <h2 className="text-sm font-bold">○・✓</h2>
              <p className="text-[11px] leading-relaxed text-muted">
                様式の上の○・✓はドラッグで動かせます。要らないものは、様式の上で押すと出る✕か、ここのチェックを外すと書きません（ここでチェックを付け直すと戻ります）。
              </p>
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

          {/* 1-17号: 最後のページ（支援業務を行う体制についての説明）の名簿に載せる人を選ぶ */}
          {formKey === "t1-18" && orgId && (
            <SupportRosterPicker orgId={orgId} orgName={orgName} onChanged={() => setReloadKey((k) => k + 1)} />
          )}

          {/* いまの在留カードを見ながら、様式に入る本人の情報を確かめる・直す */}
          {embedded ? sidePanel : <WorkerCardCheckPanel workerId={workerId} onSaved={() => setReloadKey((k) => k + 1)} />}
        </aside>
      </div>
      {/* 内容確認: できあがりの PDF を見せて「これでいいですか？」 */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true">
          <div className="flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border bg-brand px-4 py-2 text-brand-foreground">
              <p className="flex-1 text-sm font-bold">内容確認：{refFormName(formKey)}</p>
            </div>
            <iframe src={preview.url} title="できあがりの PDF" className="min-h-0 flex-1 bg-neutral-200" />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-3">
              <p className="mr-auto text-base font-black">これでいいですか？</p>
              <button
                type="button"
                onClick={() => closePreview(false)}
                className="min-h-[44px] rounded-lg border border-border bg-surface px-4 text-sm font-bold"
              >
                いいえ、直す
              </button>
              <button
                type="button"
                onClick={() => closePreview(true)}
                className="min-h-[44px] rounded-lg bg-brand px-5 text-sm font-black text-brand-foreground"
              >
                はい
              </button>
            </div>
          </div>
        </div>
      )}

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
