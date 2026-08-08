import type { SupabaseClient } from "@supabase/supabase-js";
import type { Organization, OrganizationInput } from "@/types/db";

export async function listOrganizations(
  supabase: SupabaseClient,
): Promise<Organization[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as Organization[]) ?? [];
}

export async function getOrganization(
  supabase: SupabaseClient,
  id: string,
): Promise<Organization | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Organization) ?? null;
}

export async function insertOrganization(
  supabase: SupabaseClient,
  input: OrganizationInput,
): Promise<Organization> {
  const { data, error } = await supabase
    .from("organizations")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Organization;
}

export async function updateOrganization(
  supabase: SupabaseClient,
  id: string,
  input: Partial<OrganizationInput>,
): Promise<Organization> {
  const { data, error } = await supabase
    .from("organizations")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Organization;
}

// 所属中の外国人がいる場合、workers.current_organization_id は on delete set null で外れる
export async function deleteOrganization(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("organizations").delete().eq("id", id);
  if (error) throw error;
}

// ---- 所属機関の在籍者・過去の在籍者 ----
// 「誰が今いて、誰が過去にいたか」を機関の詳細ページで把握するための一覧。
// 在籍は workers.current_organization_id を見る。過去は次の3つを合わせる:
//   ・退職記録（resignations）… 機関IDつきの退職記録
//   ・機関別の雇用開始日（workers.org_employment_starts）… 転職しても残る
//   ・退職日が入ったまま機関が残っている人（current_organization_id はこの機関）

export interface OrgRosterWorker {
  id: string;
  name: string;
  kana: string;
  nationality: string;
  residenceStatus: string;
  residencePermitDate: string | null;
  residenceExpiryDate: string | null;
  support: string;
  status: string;
  startOn: string | null; // この機関での雇用開始日
  leavingOn: string | null; // この機関での退職日（過去の在籍者のみ）
  currentOrgName: string | null; // 今どこにいるか（過去の在籍者の転職先）
  wageKind: string | null; // 現在の賃金の区分（時給 など）
  wageAmount: number | null; // 現在の賃金の金額
  wageStartedOn: string | null; // その賃金の適用開始日
}

export interface OrgRoster {
  current: OrgRosterWorker[]; // 在籍中
  past: OrgRosterWorker[]; // 過去に在籍
}

interface RosterRow {
  id: string;
  name: string;
  kana: string;
  nationality: string;
  residence_status: string;
  residence_permit_date: string | null;
  residence_expiry_date: string | null;
  support: string;
  status: string;
  employment_start_on: string | null;
  leaving_on: string | null;
  current_organization_id: string | null;
  org_employment_starts: unknown;
}

const ROSTER_COLUMNS =
  "id, name, kana, nationality, residence_status, residence_permit_date, residence_expiry_date, support, status, employment_start_on, leaving_on, current_organization_id, org_employment_starts";

// org_employment_starts から、その機関での雇用開始日を取り出す
function startAtOrg(row: RosterRow, organizationId: string): string | null {
  const list = Array.isArray(row.org_employment_starts) ? row.org_employment_starts : [];
  for (const e of list) {
    if (
      e &&
      typeof e === "object" &&
      (e as { organization_id?: string }).organization_id === organizationId
    ) {
      const start = (e as { start_on?: string | null }).start_on;
      if (start) return start;
    }
  }
  // 機関別の記録が無ければ、今この機関にいる人だけ雇用開始年月日を使う
  return row.current_organization_id === organizationId ? row.employment_start_on : null;
}

export async function getOrgRoster(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrgRoster> {
  const [atOrg, everAtOrg, resigned, resignedWorkers, orgNames, wages] = await Promise.all([
    // 今この機関に紐づいている人
    supabase.from("workers").select(ROSTER_COLUMNS).eq("current_organization_id", organizationId),
    // 過去にこの機関で働いた記録がある人（転職して機関が変わっていても残る）。
    // jsonb の包含検索は JSON 文字列で渡す（配列で渡すとPostgreSQLの配列表記になってしまう）
    supabase
      .from("workers")
      .select(ROSTER_COLUMNS)
      .contains("org_employment_starts", JSON.stringify([{ organization_id: organizationId }])),
    // この機関からの退職記録
    supabase
      .from("resignations")
      .select("worker_id, leaving_on")
      .eq("organization_id", organizationId)
      .order("leaving_on", { ascending: false }),
    // 退職記録から辿る外国人（所属機関が別に移っていて上の2つに出てこない人を拾う）
    supabase
      .from("workers")
      .select(ROSTER_COLUMNS)
      .in(
        "id",
        await supabase
          .from("resignations")
          .select("worker_id")
          .eq("organization_id", organizationId)
          .then(
            ({ data }) =>
              ((data as { worker_id: string }[] | null) ?? []).map((r) => r.worker_id),
            () => [],
          ),
      ),
    supabase.from("organizations").select("id, name"),
    // この機関での賃金（現在の賃金を一覧に出す）
    supabase
      .from("worker_wages")
      .select("worker_id, kind, amount, started_on, created_at")
      .eq("organization_id", organizationId)
      .order("started_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  // 在籍中の一覧は必ず必要。ここが取れないときだけエラーにする
  if (atOrg.error) throw atOrg.error;

  const orgNameById = new Map(
    (((orgNames.data as { id: string; name: string }[] | null) ?? []) as {
      id: string;
      name: string;
    }[]).map((o) => [o.id, o.name]),
  );

  // 賃金も新しい順なので、1人につき最初の1件が現在の賃金になる。
  // テーブル未作成（マイグレーション未実行）でも一覧は出す
  const wageByWorker = new Map<
    string,
    { kind: string; amount: number; started_on: string }
  >();
  if (!wages.error) {
    for (const w of ((wages.data as
      | { worker_id: string; kind: string; amount: number; started_on: string }[]
      | null) ?? [])) {
      if (!wageByWorker.has(w.worker_id)) wageByWorker.set(w.worker_id, w);
    }
  }

  // 退職記録は新しい順に並んでいるので、1人につき最初の1件（＝最新）を採る
  const resignedOn = new Map<string, string>();
  for (const r of ((resigned.data as { worker_id: string; leaving_on: string }[] | null) ?? [])) {
    if (!resignedOn.has(r.worker_id)) resignedOn.set(r.worker_id, r.leaving_on);
  }

  // 過去分の2つは取れなくても在籍中の一覧は出す（記録の作り方によっては空になる）
  const byId = new Map<string, RosterRow>();
  for (const r of [
    ...((atOrg.data as unknown as RosterRow[] | null) ?? []),
    ...(everAtOrg.error ? [] : ((everAtOrg.data as unknown as RosterRow[] | null) ?? [])),
    ...(resignedWorkers.error
      ? []
      : ((resignedWorkers.data as unknown as RosterRow[] | null) ?? [])),
  ]) {
    byId.set(r.id, r);
  }

  const current: OrgRosterWorker[] = [];
  const past: OrgRosterWorker[] = [];

  for (const row of byId.values()) {
    const here = row.current_organization_id === organizationId;
    // 在籍中＝この機関に紐づいていて、退職日が入っていない
    const isCurrent = here && !row.leaving_on;
    const leavingOn = resignedOn.get(row.id) ?? (here ? row.leaving_on : null);

    const item: OrgRosterWorker = {
      id: row.id,
      name: row.name,
      kana: row.kana,
      nationality: row.nationality,
      residenceStatus: row.residence_status,
      residencePermitDate: row.residence_permit_date,
      residenceExpiryDate: row.residence_expiry_date,
      support: row.support,
      status: row.status,
      startOn: startAtOrg(row, organizationId),
      leavingOn: isCurrent ? null : leavingOn,
      currentOrgName:
        here || !row.current_organization_id
          ? null
          : (orgNameById.get(row.current_organization_id) ?? null),
      wageKind: wageByWorker.get(row.id)?.kind ?? null,
      wageAmount: wageByWorker.get(row.id)?.amount ?? null,
      wageStartedOn: wageByWorker.get(row.id)?.started_on ?? null,
    };
    (isCurrent ? current : past).push(item);
  }

  const byName = (a: OrgRosterWorker, b: OrgRosterWorker) => a.name.localeCompare(b.name, "ja");
  current.sort(byName);
  // 過去は退職日の新しい順（退職日が無い人は後ろ）
  past.sort((a, b) => {
    if (a.leavingOn && b.leavingOn) return b.leavingOn.localeCompare(a.leavingOn);
    if (a.leavingOn) return -1;
    if (b.leavingOn) return 1;
    return byName(a, b);
  });

  return { current, past };
}
