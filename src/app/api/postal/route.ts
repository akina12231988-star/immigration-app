import { NextResponse, type NextRequest } from "next/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { resolvePostal, type PostalTown } from "@/lib/postal-lookup";

export const dynamic = "force-dynamic";

// 住所 → 郵便番号（オンライン申請の「郵便番号」欄用）。
// 市区町村・町域の一覧は HeartRails Geo API（https://geoapi.heartrails.com/）から取る。
// ブラウザから直接呼ぶと CORS で止まることがあるので、ログイン済みの職員向けにサーバー側で取り次ぐ。
// 一覧はメモリに置いて、同じ都道府県・市区町村は何度も取りに行かない

const API = "https://geoapi.heartrails.com/api/json";
const cityCache = new Map<string, string[]>();
const townCache = new Map<string, PostalTown[]>();

async function fetchJson(params: Record<string, string>): Promise<unknown> {
  const url = `${API}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`geoapi ${res.status}`);
  return res.json();
}

async function citiesOf(prefecture: string): Promise<string[]> {
  const hit = cityCache.get(prefecture);
  if (hit) return hit;
  const json = (await fetchJson({ method: "getCities", prefecture })) as {
    response?: { location?: { city?: string }[] };
  };
  const cities = (json.response?.location ?? []).map((l) => l.city ?? "").filter(Boolean);
  if (cities.length > 0) cityCache.set(prefecture, cities);
  return cities;
}

async function townsOf(prefecture: string, city: string): Promise<PostalTown[]> {
  const key = `${prefecture}/${city}`;
  const hit = townCache.get(key);
  if (hit) return hit;
  const json = (await fetchJson({ method: "getTowns", prefecture, city })) as {
    response?: { location?: { town?: string; postal?: string }[] };
  };
  const towns = (json.response?.location ?? [])
    .map((l) => ({ town: l.town ?? "", postal: l.postal ?? "" }))
    .filter((t) => t.town);
  if (towns.length > 0) townCache.set(key, towns);
  return towns;
}

// GET /api/postal?address=熊本県八代市郡築三番町175番地2 → { postal: "8660008", matched: "熊本県八代市郡築三番町" }
export async function GET(req: NextRequest) {
  const me = await getMyProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const address = (req.nextUrl.searchParams.get("address") ?? "").trim();
  if (!address) return NextResponse.json({ postal: "", matched: "" });
  try {
    // 町域の一覧は市区町村が決まってから取る（都道府県が分からなければ空）
    const prefecture = /^(北海道|東京都|京都府|大阪府|.{2,3}?県)/.exec(address.normalize("NFKC"))?.[1] ?? "";
    if (!prefecture) return NextResponse.json({ postal: "", matched: "" });
    const cities = await citiesOf(prefecture);
    // resolvePostal は同期なので、必要になりそうな市区町村の町域を先に取っておく
    const rest = address.normalize("NFKC").replace(/\s+/g, "").slice(prefecture.length);
    const candidates = cities.filter((c) => rest.startsWith(c));
    const townLists = new Map<string, PostalTown[]>();
    for (const c of candidates) townLists.set(c, await townsOf(prefecture, c));
    const match = resolvePostal(address, cities, (_p, c) => townLists.get(c) ?? null);
    return NextResponse.json(
      match
        ? { postal: match.postal, matched: `${match.prefecture}${match.city}${match.town}` }
        : { postal: "", matched: "" },
    );
  } catch (err) {
    return NextResponse.json(
      { postal: "", matched: "", error: err instanceof Error ? err.message : "lookup failed" },
      { status: 200 },
    );
  }
}
