"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  buildResumeHtml,
  collectResumeData,
  CURRENT_STATUS,
  emptyCareer,
  emptyFamily,
  emptyResumeForm,
  formatCareerDateInput,
  formatFullDateInput,
  JITSU_JOBS,
  optionLabel,
  OTHER_KEY,
  otherLabel,
  RESIDENCE,
  RESUME_LANGS,
  resumeText,
  SSW_FIELDS,
  translateResumeData,
  workOptions,
  type BilingualOption,
  type CareerRow,
  type FamilyRow,
  type ResumeData,
  type ResumeForm,
  type ResumeLang,
} from "@/lib/resume-tool";

// ---- 表示モード（自動／スマホ／PC）。localStorage に覚える ----
type ViewMode = "auto" | "mobile" | "pc";
const VIEW_KEY = "rirekiView";
const viewListeners = new Set<() => void>();
function readView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "mobile" || v === "pc" ? v : "auto";
  } catch {
    return "auto";
  }
}
function writeView(v: ViewMode) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // 保存できなくても動作には影響しない
  }
  viewListeners.forEach((l) => l());
}
function subscribeView(l: () => void) {
  viewListeners.add(l);
  return () => viewListeners.delete(l);
}
function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const mode = useSyncExternalStore(subscribeView, readView, () => "auto" as ViewMode);
  return [mode, writeView];
}

// ---- Messenger / LINE などのアプリ内ブラウザの判定（PDF保存が効かないので誘導する） ----
function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|MicroMessenger|Twitter|TikTok|KAKAOTALK|; wv\)|\bwv\b/i.test(ua);
}
const noopSubscribe = () => () => {};
function useInAppBrowser(): boolean {
  return useSyncExternalStore(noopSubscribe, isInAppBrowser, () => false);
}

const INPUT =
  "w-full rounded-[7px] border-[1.5px] border-[#d0dbe8] bg-[#f8fafc] px-2.5 py-2 text-[15px] text-[#111] outline-none focus:border-[#2d6a9f] focus:bg-white";
const ROW_INPUT =
  "w-full rounded-md border-[1.5px] border-[#d0dbe8] bg-white p-[7px] text-[13px] text-[#111] outline-none focus:border-[#2d6a9f]";
const LABEL = "mb-[3px] block text-[11px] font-semibold text-[#555]";
const SEC = "mt-6 mb-3 border-l-4 border-[#2d6a9f] pl-2 text-[13px] font-bold text-[#1a3a5c]";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={LABEL}>{label}</label>
      {children}
    </div>
  );
}

function Radio({
  name,
  value,
  current,
  label,
  onChange,
}: {
  name: string;
  value: string;
  current: string;
  label: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[14px] text-[#333]">
      <input
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
        className="h-3.5 w-3.5 accent-[#2d6a9f]"
      />
      {label}
    </label>
  );
}

function Options({ list, lang, placeholder }: { list: BilingualOption[]; lang: ResumeLang; placeholder: string }) {
  return (
    <>
      <option value="">{placeholder}</option>
      {list.map((o) => (
        <option key={o.key} value={o.key}>
          {optionLabel(o, lang)}
        </option>
      ))}
    </>
  );
}

export function ResumeTool() {
  const [lang, setLang] = useState<ResumeLang | null>(null);
  const [form, setForm] = useState<ResumeForm>(() => emptyResumeForm());
  const [view, setView] = useViewMode();
  const inApp = useInAppBrowser();
  const [gateDismissed, setGateDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ html: string; data: ResumeData } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const t = resumeText(lang ?? "ja");
  const L = lang ?? "ja";

  const patch = useCallback((p: Partial<ResumeForm>) => setForm((f) => ({ ...f, ...p })), []);
  const patchCareer = useCallback(
    (id: number, p: Partial<CareerRow>) =>
      setForm((f) => ({ ...f, careers: f.careers.map((c) => (c.id === id ? { ...c, ...p } : c)) })),
    [],
  );
  const patchFamily = useCallback(
    (id: number, p: Partial<FamilyRow>) =>
      setForm((f) => ({ ...f, families: f.families.map((r) => (r.id === id ? { ...r, ...p } : r)) })),
    [],
  );

  const works = useMemo(() => workOptions(form.jtypeKey), [form.jtypeKey]);

  // 写真は data URL にして履歴書に埋め込む
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => patch({ photo: typeof r.result === "string" ? r.result : "" });
    r.readAsDataURL(file);
  };

  // プレビュー（翻訳なし）
  const preview = () => {
    const data = collectResumeData(form);
    setPending({ html: buildResumeHtml(data, L), data });
  };

  // 日本語に翻訳して履歴書を作る。翻訳に失敗しても原文のまま必ず作る
  const translateAndBuild = async () => {
    setBusy(true);
    const raw = collectResumeData(form);
    try {
      const translated = await translateResumeData(raw, L);
      setPending({ html: buildResumeHtml(translated, L), data: translated });
    } catch {
      setPending({ html: buildResumeHtml(raw, L), data: raw });
    } finally {
      setBusy(false);
    }
  };

  // 実URL（Blob）で別ウィンドウに開く。端末の「共有→プリント」やアプリ内ブラウザからの
  // 「Safari/Chromeで開く」が確実に効き、文字付きPDF（取り込み可）で保存できる
  const openPdfWindow = () => {
    if (!pending) return;
    const url = URL.createObjectURL(new Blob([pending.html], { type: "text/html" }));
    setPending(null);
    const w = window.open(url, "_blank");
    if (!w) window.location.href = url;
  };

  // アプリ内ブラウザから標準ブラウザで開く（Android は Chrome を直接起動）
  const openExternal = () => {
    const url = location.href;
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) {
      const noScheme = url.replace(/^https?:\/\//, "");
      location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
      return;
    }
    if (/iPhone|iPad|iPod/i.test(ua)) {
      try {
        location.href = `x-safari-${url}`;
      } catch {
        // iOS は JS から Safari を強制起動できないため、画面の手順に従ってもらう
      }
      return;
    }
    window.open(url, "_blank");
  };
  const copyUrl = async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("このURLをコピーしてブラウザに貼り付けてください", url);
    }
  };

  const forceMobile = view === "mobile";
  const forcePc = view === "pc";
  // 自動: 600px 以下で1列。強制スマホ: 常に1列。強制PC: 常に横並び
  const c2 = forceMobile ? "grid-cols-1" : forcePc ? "grid-cols-2" : "grid-cols-1 min-[601px]:grid-cols-2";
  const c3 = forceMobile ? "grid-cols-1" : forcePc ? "grid-cols-3" : "grid-cols-1 min-[601px]:grid-cols-3";
  const careerCols = forceMobile
    ? "grid-cols-2"
    : forcePc
      ? "grid-cols-[1fr_1fr_1.3fr_1.2fr_1.2fr_26px]"
      : "grid-cols-2 min-[601px]:grid-cols-[1fr_1fr_1.3fr_1.2fr_1.2fr_26px]";
  const familyCols = forceMobile
    ? "grid-cols-2"
    : forcePc
      ? "grid-cols-[80px_1fr_80px_1fr_26px]"
      : "grid-cols-2 min-[601px]:grid-cols-[80px_1fr_80px_1fr_26px]";

  // ---- 言語選択 ----
  if (!lang) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#1a3a5c] to-[#2d6a9f] px-5 py-10">
        <h1 className="mb-1.5 text-center text-[20px] font-bold tracking-[.1em] text-white">特定技能外国人の履歴書</h1>
        <p className="mb-9 text-center text-[13px] text-white/70">言語を選択 / Pilih Bahasa / Chọn ngôn ngữ</p>
        <div className="grid w-full max-w-[460px] grid-cols-2 gap-3.5">
          {RESUME_LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className="rounded-xl bg-white px-3.5 py-5 text-center shadow-[0_4px_14px_rgba(0,0,0,.15)] transition-transform active:scale-[.97]"
            >
              <span className="mb-1.5 block text-[30px]">{l.flag}</span>
              <span className="block text-[13px] font-bold text-[#1a3a5c]">{l.name}</span>
              <span className="mt-0.5 block text-[11px] text-[#888]">{l.sub}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- 入力フォーム ----
  return (
    <div className={`min-h-screen bg-[#f0f4f8] text-[#111] ${forcePc ? "min-w-[900px]" : ""}`}>
      {/* 外部ブラウザ誘導（Messenger等のアプリ内ブラウザ対策） */}
      {inApp && !gateDismissed && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gradient-to-br from-[#1a3a5c] to-[#2d6a9f] p-6">
          <div className="w-full max-w-[400px] rounded-[18px] bg-white px-5.5 py-6.5 text-center shadow-[0_14px_40px_rgba(0,0,0,.3)]">
            <div className="mb-1.5 text-[40px]">🌐</div>
            <h2 className="mb-2.5 text-[18px] font-bold text-[#1a3a5c]">ブラウザで開いてください</h2>
            <p className="mb-4 text-[13px] leading-[1.7] text-[#555]">
              アプリ内の画面では、PDF保存などが正しく動作しません。SafariやChromeなどのブラウザで開いてご利用ください。
            </p>
            <button type="button" onClick={openExternal} className="mb-2.5 w-full rounded-[10px] bg-[#1a3a5c] p-[15px] text-[15px] font-bold text-white">
              🌐 ブラウザで開く
            </button>
            <button type="button" onClick={copyUrl} className="mb-4 w-full rounded-[10px] bg-[#e8f0fb] p-[13px] text-[14px] font-bold text-[#1a3a5c]">
              {copied ? "コピーしました ✓" : "🔗 リンクをコピー"}
            </button>
            <div className="mb-3 rounded-[10px] bg-[#f0f6ff] p-3.5 text-left text-[12.5px] leading-[1.8] text-[#333]">
              <p>
                <b className="text-[#1a3a5c]">iPhone：</b>画面下の「共有」または右下の「•••」→<b className="text-[#1a3a5c]">「Safariで開く」</b>
              </p>
              <p>
                <b className="text-[#1a3a5c]">Android：</b>右上の「⋮」→<b className="text-[#1a3a5c]">「ブラウザで開く」</b>（またはChromeで開く）
              </p>
            </div>
            <button type="button" onClick={() => setGateDismissed(true)} className="text-[12.5px] text-[#94a3b8] underline">
              このまま続ける
            </button>
          </div>
        </div>
      )}

      {/* 翻訳中 */}
      {busy && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4.5 bg-[rgba(20,40,70,.85)] p-7 text-center text-white">
          <div className="h-[46px] w-[46px] animate-spin rounded-full border-4 border-white/30 border-t-white" />
          <div className="text-[16px] leading-[1.6]">{t.overlayMsg}</div>
        </div>
      )}

      {/* PDF保存案内 */}
      {pending && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-5">
          <div className="w-full max-w-[400px] rounded-2xl bg-white px-6 py-7 text-center">
            <h3 className="mb-3 text-[17px] font-bold text-[#1a3a5c]">📄 PDF保存の方法</h3>
            <p className="mb-5 whitespace-pre-line text-[13px] leading-[1.7] text-[#555]">{t.modalDesc}</p>
            {pending.data.translateNote && (
              <p className="-mt-2 mb-3.5 text-[11px] leading-[1.6] text-[#c0392b]">{pending.data.translateNote}</p>
            )}
            <ol className="mb-5 list-decimal rounded-[10px] bg-[#f0f6ff] p-4 pl-8 text-left text-[13px] text-[#333]">
              <li className="mb-2">{t.modalStep1}</li>
              <li className="mb-2">{t.modalStep2}</li>
              <li>{t.modalStep3}</li>
            </ol>
            <button type="button" onClick={openPdfWindow} className="mb-2.5 w-full rounded-[9px] bg-[#1a3a5c] p-3.5 text-[15px] font-bold text-white">
              📄 PDFを開く
            </button>
            <button type="button" onClick={() => setPending(null)} className="text-[13px] text-[#888]">
              閉じる
            </button>
          </div>
        </div>
      )}

      <div className={`mx-auto p-4 ${forceMobile ? "max-w-[480px]" : "max-w-[860px]"}`}>
        <div className="my-5">
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-t-xl bg-[#1a3a5c] px-5 py-4 text-white">
            <h2 className="text-[15px] font-bold">{t.title}</h2>
            <div className="flex items-center gap-2.5">
              <div className="flex rounded-lg bg-white/15 p-[3px]">
                {(
                  [
                    ["auto", "自動"],
                    ["mobile", "📱"],
                    ["pc", "💻"],
                  ] as [ViewMode, string][]
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setView(m)}
                    className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-bold ${view === m ? "bg-white text-[#1a3a5c]" : "text-white/75"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setLang(null)} className="rounded-[7px] bg-white/20 px-3 py-[7px] text-[12px]">
                ← {t.back}
              </button>
            </div>
          </div>

          <div className="rounded-b-xl bg-white p-5.5 shadow-[0_4px_18px_rgba(0,0,0,.1)]">
            <div className={`${SEC} mt-0`}>{t.s1}</div>
            <div className="flex items-start gap-4.5">
              <div>
                <label className="mb-1 block text-[11px] text-[#555]">{t.photo}</label>
                <div
                  onClick={() => photoInput.current?.click()}
                  className="flex h-[140px] w-[110px] shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-[#2d6a9f] bg-[#f0f6ff]"
                >
                  {form.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="whitespace-pre-line p-2 text-center text-[11px] leading-[1.6] text-[#2d6a9f]">{t.photoHint}</div>
                  )}
                </div>
                <input ref={photoInput} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
              </div>
              <div className="flex-1">
                <div className={`mb-2.5 grid gap-[11px] ${c2}`}>
                  <Field label={t.kana}>
                    <input type="text" value={form.kana} onChange={(e) => patch({ kana: e.target.value })} placeholder="ヴォン　ヴァン　タァン" className={INPUT} />
                  </Field>
                  <Field label={t.gender}>
                    <div className="flex flex-wrap gap-3 py-[3px]">
                      <Radio name="gender" value="男性" current={form.gender} label={t.male} onChange={(v) => patch({ gender: v })} />
                      <Radio name="gender" value="女性" current={form.gender} label={t.female} onChange={(v) => patch({ gender: v })} />
                    </div>
                  </Field>
                </div>
                <div className={`grid gap-[11px] ${c2}`}>
                  <Field label={t.name}>
                    <input type="text" value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="VUONG VAN THANH" className={INPUT} />
                  </Field>
                  <Field label={t.dob}>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={form.dob}
                      onChange={(e) => patch({ dob: e.target.value })}
                      onBlur={(e) => patch({ dob: formatFullDateInput(e.target.value) })}
                      placeholder="1995/03/01"
                      className={INPUT}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className={`mt-[13px] grid gap-[11px] ${c3}`}>
              <Field label={t.nat}>
                <input type="text" value={form.nat} onChange={(e) => patch({ nat: e.target.value })} className={INPUT} />
              </Field>
              <Field label={t.lang}>
                <input type="text" value={form.lang} onChange={(e) => patch({ lang: e.target.value })} className={INPUT} />
              </Field>
              <Field label={t.spouse}>
                <div className="flex flex-wrap gap-3 py-[3px]">
                  <Radio name="spouse" value="有" current={form.spouse} label={t.yes} onChange={(v) => patch({ spouse: v })} />
                  <Radio name="spouse" value="無" current={form.spouse} label={t.no} onChange={(v) => patch({ spouse: v })} />
                </div>
              </Field>
            </div>

            <div className={`mt-3 grid gap-[11px] ${c2}`}>
              <Field label={t.jtype}>
                <select
                  value={form.jtypeKey}
                  onChange={(e) => patch({ jtypeKey: e.target.value, jworkKey: "", jworkOther: "", jtypeOther: "" })}
                  className={INPUT}
                >
                  <Options list={JITSU_JOBS} lang={L} placeholder={t.cstatPlaceholder} />
                  <option value={OTHER_KEY}>{otherLabel(L)}</option>
                </select>
                {form.jtypeKey === OTHER_KEY && (
                  <input type="text" value={form.jtypeOther} onChange={(e) => patch({ jtypeOther: e.target.value })} placeholder={t.otherPh} className={`${INPUT} mt-1.5`} />
                )}
              </Field>
              <Field label={t.jwork}>
                <select value={form.jworkKey} onChange={(e) => patch({ jworkKey: e.target.value, jworkOther: "" })} className={INPUT}>
                  <Options list={works} lang={L} placeholder={t.cstatPlaceholder} />
                  <option value={OTHER_KEY}>{otherLabel(L)}</option>
                </select>
                {form.jworkKey === OTHER_KEY && (
                  <input type="text" value={form.jworkOther} onChange={(e) => patch({ jworkOther: e.target.value })} placeholder={t.otherPh} className={`${INPUT} mt-1.5`} />
                )}
              </Field>
            </div>

            <div className={`mt-3 grid gap-[11px] ${c2}`}>
              <Field label={t.tend}>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.tend}
                  onChange={(e) => patch({ tend: e.target.value })}
                  onBlur={(e) => patch({ tend: formatFullDateInput(e.target.value) })}
                  placeholder="2022/03/31"
                  className={INPUT}
                />
              </Field>
              <Field label={t.vexp}>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.vexp}
                  onChange={(e) => patch({ vexp: e.target.value })}
                  onBlur={(e) => patch({ vexp: formatFullDateInput(e.target.value) })}
                  placeholder="2027/04/01"
                  className={INPUT}
                />
              </Field>
            </div>

            <div className={`mt-3 grid gap-[11px] ${c2}`}>
              <Field label={t.status}>
                <select value={form.statusKey} onChange={(e) => patch({ statusKey: e.target.value })} className={INPUT}>
                  <Options list={CURRENT_STATUS} lang={L} placeholder={t.cstatPlaceholder} />
                </select>
              </Field>
              <Field label={t.adjp}>
                <input type="text" value={form.adjp} onChange={(e) => patch({ adjp: e.target.value })} className={INPUT} />
              </Field>
            </div>
            <Field label={t.adhm} className="mt-3">
              <input type="text" value={form.adhm} onChange={(e) => patch({ adhm: e.target.value })} className={INPUT} />
            </Field>

            {/* ⑨ 職歴 */}
            <div className={SEC}>{t.s2}</div>
            <div className="mb-3 rounded-lg border border-[#f3c0c0] bg-[#fff5f5] px-[11px] py-[9px] text-[12px] font-bold leading-[1.6] text-[#c0392b]">{t.s2note}</div>
            <div className="mb-2 flex flex-col gap-2">
              {form.careers.map((c) => (
                <div key={c.id} className={`grid items-end gap-1.5 rounded-lg border border-[#e0eaf4] bg-[#f8fafc] p-2 ${careerCols}`}>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#777]">{t.cfrom}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={c.from}
                      onChange={(e) => patchCareer(c.id, { from: e.target.value })}
                      onBlur={(e) => patchCareer(c.id, { from: formatCareerDateInput(e.target.value) })}
                      placeholder="2019/04"
                      className={ROW_INPUT}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#777]">{t.cto}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={c.to}
                      onChange={(e) => patchCareer(c.id, { to: e.target.value })}
                      onBlur={(e) => patchCareer(c.id, { to: formatCareerDateInput(e.target.value) })}
                      placeholder="2022/03"
                      className={ROW_INPUT}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#777]">{t.ccomp}</label>
                    <input type="text" value={c.company} onChange={(e) => patchCareer(c.id, { company: e.target.value })} className={ROW_INPUT} />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#777]">{t.cfield}</label>
                    <select value={c.fieldKey} onChange={(e) => patchCareer(c.id, { fieldKey: e.target.value })} className={ROW_INPUT}>
                      <Options list={SSW_FIELDS} lang={L} placeholder={t.cstatPlaceholder} />
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#777]">{t.cstat}</label>
                    <select value={c.statKey} onChange={(e) => patchCareer(c.id, { statKey: e.target.value })} className={ROW_INPUT}>
                      <Options list={RESIDENCE} lang={L} placeholder={t.cstatPlaceholder} />
                    </select>
                  </div>
                  <button
                    type="button"
                    aria-label="削除"
                    onClick={() => setForm((f) => ({ ...f, careers: f.careers.filter((x) => x.id !== c.id) }))}
                    className="h-6 w-6 self-end rounded-[5px] bg-[#fee] text-[14px] text-[#c00]"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, careers: [...f.careers, emptyCareer()] }))}
              className="w-full rounded-[7px] border-[1.5px] border-dashed border-[#2d6a9f] bg-[#e8f0fb] p-[9px] text-[12px] font-semibold text-[#2d6a9f]"
            >
              {t.addC}
            </button>

            {/* ⑩ 資格・免許 */}
            <div className={SEC}>{t.s3}</div>
            <textarea rows={2} value={form.lic} onChange={(e) => patch({ lic: e.target.value })} placeholder="専門級、技能実習終了証明書 など" className={`${INPUT} min-h-[60px] resize-y`} />

            {/* 体の状態 */}
            <div className={SEC}>{t.s4}</div>
            <div className={`grid gap-[11px] ${c3}`}>
              <Field label={t.ht}>
                <input type="number" value={form.ht} onChange={(e) => patch({ ht: e.target.value })} className={INPUT} />
              </Field>
              <Field label={t.wt}>
                <input type="number" value={form.wt} onChange={(e) => patch({ wt: e.target.value })} className={INPUT} />
              </Field>
              <Field label={t.bl}>
                <select value={form.bl} onChange={(e) => patch({ bl: e.target.value })} className={INPUT}>
                  <option value="">--</option>
                  {["A型", "B型", "O型", "AB型"].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className={`mt-[11px] grid gap-[11px] ${c2}`}>
              <Field label={t.ill}>
                <input type="text" value={form.ill} onChange={(e) => patch({ ill: e.target.value })} className={INPUT} />
              </Field>
              <Field label={t.vis}>
                <input type="text" value={form.vis} onChange={(e) => patch({ vis: e.target.value })} placeholder="1.0 / 1.0" className={INPUT} />
              </Field>
            </div>
            <div className={`mt-[11px] grid gap-[11px] ${c2}`}>
              <Field label={t.hand}>
                <div className="flex flex-wrap gap-3 py-[3px]">
                  <Radio name="hand" value="右" current={form.hand} label={t.right} onChange={(v) => patch({ hand: v })} />
                  <Radio name="hand" value="左" current={form.hand} label={t.left} onChange={(v) => patch({ hand: v })} />
                </div>
              </Field>
              <Field label={t.hob}>
                <input type="text" value={form.hob} onChange={(e) => patch({ hob: e.target.value })} className={INPUT} />
              </Field>
            </div>
            <div className={`mt-[11px] grid gap-[11px] ${c2}`}>
              <Field label={t.drink}>
                <div className="flex flex-wrap gap-3 py-[3px]">
                  <Radio name="drink" value="無" current={form.drink} label={t.nd} onChange={(v) => patch({ drink: v })} />
                  <Radio name="drink" value="時々" current={form.drink} label={t.st} onChange={(v) => patch({ drink: v })} />
                  <Radio name="drink" value="沢山" current={form.drink} label={t.al} onChange={(v) => patch({ drink: v })} />
                </div>
              </Field>
              <Field label={t.smoke}>
                <div className="flex flex-wrap gap-3 py-[3px]">
                  <Radio name="smoke" value="無" current={form.smoke} label={t.ns} onChange={(v) => patch({ smoke: v })} />
                  <Radio name="smoke" value="時々" current={form.smoke} label={t.ss} onChange={(v) => patch({ smoke: v })} />
                  <Radio name="smoke" value="沢山" current={form.smoke} label={t.as} onChange={(v) => patch({ smoke: v })} />
                </div>
              </Field>
            </div>

            {/* 家族構成 */}
            <div className={SEC}>{t.s5}</div>
            <div className="mb-2 flex flex-col gap-2">
              {form.families.map((r) => (
                <div key={r.id} className={`grid items-end gap-1.5 rounded-lg border border-[#e0eaf4] bg-[#f8fafc] p-2 ${familyCols}`}>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#777]">{t.frel}</label>
                    <input type="text" value={r.relation} onChange={(e) => patchFamily(r.id, { relation: e.target.value })} className={ROW_INPUT} />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#777]">{t.fname}</label>
                    <input type="text" value={r.name} onChange={(e) => patchFamily(r.id, { name: e.target.value })} className={ROW_INPUT} />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#777]">{t.fage}</label>
                    <input type="number" value={r.birthYear} onChange={(e) => patchFamily(r.id, { birthYear: e.target.value })} placeholder="1965" className={ROW_INPUT} />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#777]">{t.fjob}</label>
                    <input type="text" value={r.job} onChange={(e) => patchFamily(r.id, { job: e.target.value })} className={ROW_INPUT} />
                  </div>
                  <button
                    type="button"
                    aria-label="削除"
                    onClick={() => setForm((f) => ({ ...f, families: f.families.filter((x) => x.id !== r.id) }))}
                    className="h-6 w-6 self-end rounded-[5px] bg-[#fee] text-[14px] text-[#c00]"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, families: [...f.families, emptyFamily()] }))}
              className="w-full rounded-[7px] border-[1.5px] border-dashed border-[#2d6a9f] bg-[#e8f0fb] p-[9px] text-[12px] font-semibold text-[#2d6a9f]"
            >
              {t.addF}
            </button>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <button type="button" onClick={preview} className="rounded-[9px] bg-[#e8f0fb] px-4.5 py-3.5 text-[13px] font-bold text-[#1a3a5c]">
                {t.prev}
              </button>
              <button
                type="button"
                onClick={translateAndBuild}
                disabled={busy}
                className="min-w-[200px] flex-1 rounded-[9px] bg-[#1a3a5c] p-4 text-[14px] font-bold leading-[1.4] text-white active:bg-[#2d6a9f] disabled:opacity-60"
              >
                {t.pdf}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
