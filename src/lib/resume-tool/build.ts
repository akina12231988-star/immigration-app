// 履歴書PDF（A4・1枚のHTML）と、そのPDFへ埋め込む機械可読データを作る。
//
// 埋め込みは PDF の文字層に白い極小の文字で
//   @@RIREKI_JSON_V1@@<Base64のJSON>@@END@@
// と入れる。外国人の登録画面（/workers/resume-import）がこれを読み取って登録する。
// データの形（schema: tokutei-rireki v1）は src/lib/rireki-import.ts の RirekiPayload と対。

import type { RirekiPayload } from "@/lib/rireki-import";
import type { ResumeLang } from "./i18n";
import type { ResumeData } from "./form";
import { calcAge, formatResumeDate, formatYearMonth, toIsoDate } from "./dates";

export const RIREKI_EMBED_START = "@@RIREKI_JSON_V1@@";
export const RIREKI_EMBED_END = "@@END@@";

export function buildResumePayload(d: ResumeData, lang: ResumeLang, now: Date = new Date()): RirekiPayload {
  return {
    docType: "resume",
    schema: "tokutei-rireki",
    version: 1,
    generatedAt: now.toISOString(),
    sourceLang: lang,
    basic: {
      name: d.name,
      kana: d.kana,
      gender: d.gender,
      birth: toIsoDate(d.dob),
      nationality: d.nat,
      languages: d.lang,
      spouse: d.spouse,
      trainingType: d.jtype,
      trainingTypeKey: d.jtypeKey || "",
      trainingWork: d.jwork,
      trainingWorkKey: d.jworkKey || "",
      trainingEnd: toIsoDate(d.tend),
      visaExpiry: toIsoDate(d.vexp),
      residenceStatus: d.status,
      residenceStatusKey: d.statusKey || "",
      addressJapan: d.adjp,
      addressHome: d.adhm,
      qualifications: d.lic,
      height: d.ht,
      weight: d.wt,
      bloodType: d.bl,
      illness: d.ill,
      vision: d.vis,
      dominantHand: d.hand,
      hobby: d.hob,
      drinking: d.drink,
      smoking: d.smoke,
    },
    careers: d.careers
      .filter((c) => c.comp || c.fy || c.statJa)
      .map((c) => ({
        startYear: c.fy,
        startMonth: c.fm,
        startDay: c.fd || "",
        endYear: c.ty,
        endMonth: c.tm,
        endDay: c.td || "",
        company: c.comp,
        sswFieldKey: c.fieldKey || "",
        sswField: c.fieldJa || "",
        residenceStatusKey: c.statKey,
        residenceStatus: c.statJa || "",
      })),
    families: d.families
      .filter((f) => f.name || f.rel)
      .map((f) => ({ relation: f.rel, name: f.name, birthYear: f.age, job: f.job })),
  };
}

// UTF-8 の Base64（ブラウザ・Node どちらでも動く）
export function encodeResumePayload(payload: RirekiPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// 本人の入力をHTMLに入れるので、タグとして解釈されないようにする
export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;

function ageHtml(dob: string, now: Date): string {
  const a = calcAge(dob, now);
  return a == null ? "" : `<br><span style="font-size:9.5px;color:#475569;">（満${a}歳）</span>`;
}

// 写真は data URL（画像）だけを受け付ける
function photoHtml(photo: string): string {
  if (photo && /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(photo)) {
    return `<img src="${photo}" style="width:90px;height:114px;object-fit:cover;border:1px solid #cbd5e1;">`;
  }
  return `<div style="width:90px;height:114px;border:1px solid #cbd5e1;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94a3b8;font-family:sans-serif;">写真</div>`;
}

// 履歴書の見た目。A4 1枚に収まることを最優先にしている。
//  - @page の余白を 0 にしてブラウザのヘッダー/フッター（URL・日付）が入る余白をなくし、紙の余白は .page の内側で取る
//  - text-size-adjust:100% で、スマホの Chrome が印刷時に文字を勝手に大きくする（文字の自動拡大）のを止める
//  - 職歴・家族の行が多いときは .dense で文字と余白をさらに詰める
const RESUME_CSS = `*{box-sizing:border-box;margin:0;padding:0}html{-webkit-text-size-adjust:100%;text-size-adjust:100%}html,body{background:#e9eef4}body{font-family:'Noto Sans JP',sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;padding:14px 10px 40px}.bar{max-width:210mm;margin:0 auto 12px;display:flex;flex-wrap:wrap;align-items:center;gap:10px}.bar button{background:#1e3a5f;color:#fff;border:none;border-radius:10px;padding:12px 18px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px rgba(30,58,95,.25)}.bar button:active{background:#2d5580}.bar span{font-size:11px;color:#64748b}.viewport{width:100%;overflow:hidden}.page{width:210mm;min-height:297mm;background:#fff;margin:0 auto;padding:12mm 12mm;border-radius:14px;box-shadow:0 12px 40px rgba(15,23,42,.14)}.rhead{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:3px solid #1e3a5f;padding-bottom:8px;margin-bottom:10px}.rtitle h1{font-size:20px;font-weight:700;letter-spacing:.22em;color:#1e3a5f;line-height:1.3}.rtitle p{font-size:9px;letter-spacing:.16em;color:#94a3b8;margin-top:5px}.rphoto img,.rphoto>div{border-radius:6px}table{width:100%;border-collapse:collapse}table+table{margin-top:-1px}td,th{border:1px solid #cbd5e1;padding:6px 8px;vertical-align:middle;font-size:11.5px;line-height:1.5}.lc{background:#eef2f7;font-weight:700;font-size:10px;white-space:nowrap;text-align:center;color:#334155}.lc.wrap{white-space:normal}.sp td{height:12px;padding:0}.nb{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;background:#1e3a5f;color:#fff;border-radius:50%;font-size:8px;margin-right:3px;font-weight:700}.dense td,.dense th{padding:3px 6px;font-size:10px;line-height:1.35}.dense .lc{font-size:9px}.dense .sp td{height:6px}.dense .rhead{padding-bottom:6px;margin-bottom:8px}.rireki-data{color:#fff;font-size:4px;line-height:1.1;word-break:break-all;user-select:all;margin-top:4px}.howto{position:fixed;inset:0;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;padding:18px;z-index:50}.howto-box{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:22px;max-height:88vh;overflow:auto}.howto-box h3{color:#1e3a5f;font-size:17px;margin-bottom:8px}.howto-box p{font-size:12.5px;color:#475569;margin-bottom:14px;line-height:1.6}.howto-box .primary{width:100%;background:#1e3a5f;color:#fff;border:none;border-radius:10px;padding:13px 14px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:14px;line-height:1.4}.howto-steps{background:#f1f5f9;border-radius:10px;padding:14px;font-size:12.5px;color:#334155;line-height:1.7}.howto-steps ol{margin:6px 0 12px 18px}.howto-steps b{color:#1e3a5f}.howto-close{width:100%;background:none;border:none;color:#94a3b8;font-size:13px;margin-top:12px;cursor:pointer;font-family:inherit}@media print{html,body{background:#fff}body{padding:0}.bar,.howto{display:none!important}.viewport{overflow:visible;height:auto!important}.page{width:210mm;min-height:0;margin:0;padding:10mm 11mm;border-radius:0;box-shadow:none;transform:none!important}tr,td,th{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}table{break-inside:auto}@page{size:A4 portrait;margin:0}}`;

// スマホでは A4 を画面幅に縮めて全体を見せる
const FIT_SCRIPT = `function fit(){var p=document.querySelector('.page'),w=document.querySelector('.viewport');if(!p||!w)return;p.style.transform='';p.style.transformOrigin='top left';w.style.height='';var avail=w.clientWidth,pw=p.offsetWidth;if(avail<pw-1){var s=avail/pw;p.style.transform='scale('+s+')';w.style.height=(p.offsetHeight*s)+'px';}}window.addEventListener('load',fit);window.addEventListener('resize',fit);function fitPrint(){var p=document.querySelector('.page');if(!p)return;p.style.zoom='';var pageH=297/25.4*96,h=p.scrollHeight;if(h>pageH+1){p.style.zoom=String(Math.max(0.6,pageH/h-0.005));}}window.addEventListener('beforeprint',fitPrint);window.addEventListener('afterprint',function(){var p=document.querySelector('.page');if(p)p.style.zoom='';});`;

const HOWTO_HTML = `<div class="howto no-print" id="howto"><div class="howto-box"><h3>📄 PDFで保存する方法</h3><p>ご利用の環境に合わせてお選びください。Messenger・LINEなどのアプリ内で開いている場合は、下の手順で保存してください。</p><button class="primary" onclick="try{window.print()}catch(e){}">🖨 印刷／PDF保存ダイアログを開く<br><small style="font-weight:400;opacity:.85">Safari・Chrome・パソコン向け</small></button><div class="howto-steps"><b>iPhone（アプリ内ブラウザ）</b><ol><li>画面下の「共有」ボタン（□に↑）を押す</li><li>「プリント」を選ぶ</li><li>プレビューを2本指で外側に広げる</li><li>右上の「共有」→「ファイルに保存」</li></ol><b>Android</b><ol><li>メニュー（⋮）→「共有」または「印刷」</li><li>送信先で「PDF形式で保存」を選ぶ</li></ol>うまくいかない場合は、メニューから<b>「Safari／Chromeで開く」</b>後に同じ操作をしてください。</div><button class="howto-close" onclick="document.getElementById('howto').style.display='none'">閉じる</button></div></div>`;

// 履歴書のHTML（別ウィンドウで開いて「印刷→PDF保存」する完結した1ページ）
export function buildResumeHtml(d: ResumeData, lang: ResumeLang, now: Date = new Date()): string {
  const careers = d.careers.filter((c) => c.comp || c.fy);
  const families = d.families.filter((f) => f.name || f.rel);
  const emptyRow = `<tr><td class="lc"></td><td colspan="6" style="height:22px;"></td></tr>`;
  // 職歴・家族の行が多いときは文字と余白を詰めて A4 1枚に収める
  const dense = Math.max(careers.length, 1) + Math.max(families.length, 1) > 6;
  const cRows =
    careers
      .map(
        (c) =>
          `<tr><td class="lc"></td><td style="text-align:center;">${e(formatYearMonth(c.fy, c.fm, c.fd))}</td><td style="text-align:center;">${e(formatYearMonth(c.ty, c.tm, c.td))}</td><td colspan="2">${e(c.comp)}</td><td style="text-align:center;">${e(c.fieldJa)}</td><td style="text-align:center;">${e(c.statJa)}</td></tr>`,
      )
      .join("") || emptyRow;
  const fRows =
    families
      .map(
        (f) =>
          `<tr><td class="lc"></td><td style="text-align:center;">${e(f.rel)}</td><td colspan="2">${e(f.name)}</td><td style="text-align:center;">${f.age ? `${e(f.age)}年` : ""}</td><td colspan="2">${e(f.job)}</td></tr>`,
      )
      .join("") || emptyRow;
  const vis = d.vis ? d.vis.split("/") : ["", ""];
  const payloadB64 = encodeResumePayload(buildResumePayload(d, lang, now));

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(d.name || "履歴書")} 履歴書</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet"><style>${RESUME_CSS}</style></head><body><div class="bar"><button onclick="document.getElementById('howto').style.display='flex'">📄 PDFに保存 / 印刷</button><span>スマホは全体表示・PDFはA4で保存されます</span></div>${HOWTO_HTML}<div class="viewport"><div class="page${dense ? " dense" : ""}"><header class="rhead"><div class="rtitle"><h1>特定技能外国人の履歴書</h1><p>SPECIFIED SKILLED WORKER · RESUME</p></div><div class="rphoto">${photoHtml(d.photo)}</div></header><table><tr><td class="lc" rowspan="2" style="width:52px;"><span class="nb">①</span>氏名</td><td class="lc" style="width:56px;">フリガナ</td><td colspan="2">${e(d.kana)}</td><td class="lc" style="width:64px;"><span class="nb">②</span>性別</td><td colspan="2">${e(d.gender)}</td></tr><tr><td class="lc">英字</td><td colspan="2">${e(d.name)}</td><td class="lc"><span class="nb">③</span>生年月日</td><td colspan="2">${e(formatResumeDate(d.dob))}${ageHtml(d.dob, now)}</td></tr><tr><td class="lc" colspan="2"><span class="nb">④</span>国籍・地域</td><td>${e(d.nat)}</td><td class="lc wrap"><span class="nb">⑤</span>十分に理解できる言語</td><td>${e(d.lang)}</td><td class="lc"><span class="nb">⑥</span>配偶者の有無</td><td style="text-align:center;">${e(d.spouse)}</td></tr><tr><td class="lc" colspan="2"><span class="nb">⑦</span>実習の職種</td><td colspan="2">${e(d.jtype)}</td><td class="lc"><span class="nb">⑧</span>実習の作業名</td><td colspan="2">${e(d.jwork)}</td></tr><tr><td class="lc" colspan="2">実習修了日</td><td colspan="2">${e(formatResumeDate(d.tend))}</td><td class="lc">ビザの期限</td><td colspan="2">${e(formatResumeDate(d.vexp))}</td></tr><tr><td class="lc" colspan="2">現在の在留資格</td><td colspan="5">${e(d.status)}</td></tr><tr><td class="lc" colspan="2">日本での現在住居地</td><td colspan="5">${e(d.adjp)}</td></tr><tr><td class="lc" colspan="2">本国の住居地</td><td colspan="5">${e(d.adhm)}</td></tr></table><table><thead><tr><th class="lc" style="width:52px;"><span class="nb">⑨</span>職歴</th><th class="lc">開始</th><th class="lc">終了</th><th class="lc" colspan="2">会社名</th><th class="lc">特定技能分野</th><th class="lc">当時の在留資格</th></tr></thead><tbody>${cRows}<tr class="sp"><td class="lc"></td><td colspan="6"></td></tr></tbody></table><table><tr><td class="lc" colspan="2"><span class="nb">⑩</span>資格・免許</td><td colspan="5" style="white-space:pre-wrap;min-height:40px;">${e(d.lic || "　－ 専門級、技能実習終了証明書")}</td></tr><tr><td class="lc" rowspan="5">体の状態</td><td class="lc">身長</td><td>${e(d.ht)} cm</td><td class="lc" rowspan="5">その他</td><td class="lc">利き手</td><td colspan="2">${e(d.hand)}</td></tr><tr><td class="lc">体重</td><td>${e(d.wt)} kg</td><td class="lc">趣味</td><td colspan="2">${e(d.hob)}</td></tr><tr><td class="lc">血液型</td><td>${e(d.bl)}</td><td class="lc">飲酒</td><td colspan="2">${e(d.drink)}</td></tr><tr><td class="lc">病気</td><td>${e(d.ill)}</td><td class="lc">タバコ</td><td colspan="2">${e(d.smoke)}</td></tr><tr><td class="lc">視力</td><td>右:${e((vis[0] ?? "").trim())} 左:${e((vis[1] ?? "").trim())}</td><td colspan="3"></td></tr></table><table><thead><tr><th class="lc" style="width:52px;">家族構成</th><th class="lc">続柄</th><th class="lc" colspan="2">氏名</th><th class="lc">年齢</th><th class="lc" colspan="2">仕事</th></tr></thead><tbody>${fRows}<tr class="sp"><td class="lc"></td><td colspan="6"></td></tr></tbody></table><div class="rireki-data">${RIREKI_EMBED_START}${payloadB64}${RIREKI_EMBED_END}</div></div></div><script>${FIT_SCRIPT}</script></body></html>`;
}
