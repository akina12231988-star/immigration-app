import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { listWorkerRosters } from "@/lib/supabase/queries/rosters";
import { normalizeDependents } from "@/lib/dependents";
import { normalizeOrgEmploymentStarts } from "@/lib/org-employment";
import { fillFuyoForm } from "@/lib/fuyo-form";
import { buildRosterPdf } from "@/lib/roster-pdf";
import { rosterJpDate, rosterWorkKind, withResidencePermitHistory } from "@/lib/roster";
import { todayStr } from "@/lib/ssw/calc";

// 入社書類の「作成して添付」用。外国人の登録内容から書類のPDFを作って返す。
// 画面はこれをそのまま添付データとして保存する（ダウンロードは不要）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT = () => readFile(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"));

function pdfResponse(bytes: Uint8Array, fileName: string) {
  return new NextResponse(new Blob([bytes as BlobPart]), {
    headers: {
      "content-type": "application/pdf",
      // 日本語ファイル名は filename*（UTF-8）で渡し、filename はASCIIのフォールバック
      "content-disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "no-store",
    },
  });
}

export async function POST(req: NextRequest) {
  const me = await getMyProfile();
  if (!me || me.role === "viewer") {
    return NextResponse.json({ error: "権限がありません" }, { status: 401 });
  }

  let body: { workerId?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const { workerId, kind } = body;
  if (!workerId || (kind !== "fuyokojo" && kind !== "meibo")) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const worker = await getWorkerWithHistories(supabase, workerId);
    if (!worker) {
      return NextResponse.json({ error: "外国人が見つかりません" }, { status: 404 });
    }

    if (kind === "fuyokojo") {
      const [template, font] = await Promise.all([
        readFile(path.join(process.cwd(), "public", "forms", "fuyo-r8.pdf")),
        FONT(),
      ]);
      const bytes = await fillFuyoForm(
        template,
        font,
        {
          kind: "入社時",
          worker: {
            name: worker.name,
            kana: worker.kana,
            birth: worker.birth,
            address: worker.address,
            myNumber: worker.my_number,
            hasSpouse: worker.has_spouse,
          },
          // 世帯主は本人、続柄は本人（作成画面と同じ初期値）
          householdHead: worker.name,
          headRelation: "本人",
          dependents: normalizeDependents(worker.dependents),
        },
        todayStr(),
      );
      return pdfResponse(bytes, `扶養控除等申告書_入社時_${worker.name}.pdf`);
    }

    // 労働者名簿。保存済みの名簿があればその内容、無ければ登録データから組み立てる
    const [rosters, font, orgRows] = await Promise.all([
      listWorkerRosters(supabase, workerId).catch(() => []),
      FONT(),
      supabase.from("organizations").select("id, name"),
    ]);
    const orgNameById = new Map(
      ((orgRows.data as { id: string; name: string }[] | null) ?? []).map((o) => [o.id, o.name]),
    );
    const orgName = worker.current_organization_id
      ? (orgNameById.get(worker.current_organization_id) ?? "")
      : "";
    const startAtOrg = normalizeOrgEmploymentStarts(worker.org_employment_starts).find(
      (e) => e.organization_id === worker.current_organization_id && e.start_on,
    )?.start_on;
    const startOn = startAtOrg ?? worker.employment_start_on;
    const saved = rosters.find((r) => r.company_name === orgName) ?? rosters[0];

    const bytes = await buildRosterPdf(font, {
      workerName: worker.name,
      kana: worker.kana,
      birth: worker.birth,
      gender: worker.gender,
      address: worker.address,
      myNumber: worker.my_number,
      companyName: saved?.company_name || orgName,
      workKind: saved?.work_kind || rosterWorkKind(worker.field),
      employmentStartOn: startOn,
      // 在留資格の許可も履歴に残す（画面の労働者名簿と同じ）
      history: withResidencePermitHistory(
        saved?.history ?? (startOn ? [{ on: rosterJpDate(startOn), content: "入社" }] : []),
        worker.residence_status,
        worker.residence_permit_date,
      ),
      previousJobs:
        saved?.previous_jobs ??
        [...worker.work_histories]
          .filter((h) => h.end_date !== null && h.org_name)
          .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
          .map((h) => ({ company: h.org_name, prefecture: "" })),
      leavingOn: saved?.leaving_on ?? (worker.status === "退職" ? rosterJpDate(worker.leaving_on) : ""),
      leavingReason:
        saved?.leaving_reason ??
        (worker.status === "退職"
          ? [worker.leaving_kind, worker.leaving_reason].filter(Boolean).join("・")
          : ""),
      issuedOn: saved?.issued_on ?? startOn ?? todayStr(),
    });
    return pdfResponse(bytes, `労働者名簿_${worker.name}_${saved?.company_name || orgName}.pdf`);
  } catch (err) {
    console.error("onboarding-doc-pdf generation failed:", err);
    return NextResponse.json({ error: "書類の作成に失敗しました" }, { status: 500 });
  }
}
