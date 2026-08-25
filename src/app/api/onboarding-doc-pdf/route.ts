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
import { buildRosterDraft, type RosterDraft } from "@/lib/roster-draft";
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

  // roster: 労働者名簿のプレビューで直した内容（渡されたときはその内容でPDFを作る）
  let body: { workerId?: string; kind?: string; roster?: RosterDraft };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const { workerId, kind, roster } = body;
  if (!workerId || (kind !== "fuyokojo" && kind !== "meibo")) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const worker = await getWorkerWithHistories(supabase, workerId);
    if (!worker) {
      return NextResponse.json({ error: "外国人が見つかりません" }, { status: 404 });
    }

    // 扶養控除等申告書・労働者名簿はどちらも個人番号を書く書類だが、
    // 個人番号だけ空欄で先に発行し、あとから本人に記入してもらう運用もあるため、
    // 未入力でも作成はできるようにしている（画面のプレビューで空欄だと分かるようにする）

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

    // プレビューで直した内容が渡されていればそれを使い、無ければ登録データから組み立てる
    const draft =
      roster ??
      buildRosterDraft(
        {
          orgName,
          field: worker.field,
          employmentStartOn: startOn,
          residenceStatus: worker.residence_status,
          residencePermitDate: worker.residence_permit_date,
          status: worker.status,
          leavingOn: worker.leaving_on,
          leavingKind: worker.leaving_kind,
          leavingReason: worker.leaving_reason,
          workHistories: worker.work_histories,
        },
        saved ?? null,
        todayStr(),
      );

    const bytes = await buildRosterPdf(font, {
      workerName: worker.name,
      kana: worker.kana,
      birth: worker.birth,
      gender: worker.gender,
      address: worker.address,
      myNumber: worker.my_number,
      companyName: draft.company_name,
      workKind: draft.work_kind,
      employmentStartOn: startOn,
      history: draft.history,
      previousJobs: draft.previous_jobs,
      leavingOn: draft.leaving_on,
      leavingReason: draft.leaving_reason,
      issuedOn: draft.issued_on,
    });
    return pdfResponse(bytes, `労働者名簿_${worker.name}_${draft.company_name || orgName}.pdf`);
  } catch (err) {
    console.error("onboarding-doc-pdf generation failed:", err);
    return NextResponse.json({ error: "書類の作成に失敗しました" }, { status: 500 });
  }
}
