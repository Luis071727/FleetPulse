import { NextRequest, NextResponse } from "next/server";

const FMCSA_BASE = "https://mobile.fmcsa.dot.gov/qc/services";
const FMCSA_KEY = process.env.FMCSA_WEB_KEY || process.env.FMCSA_API_KEY || "";
const PAGE_SIZE = 50;
const PAGES = 3; // fetch 3 pages in parallel = up to 150 results

type FmcsaCarrier = {
  dotNumber?: string | number;
  legalName?: string;
  dbaName?: string;
  phyState?: string;
  phyCity?: string;
  totalPowerUnits?: string | number;
  totalDrivers?: string | number;
  safetyRating?: string;
  carrierOperation?: string;
  cargoCarried?: string;
  telephone?: string;
  phyTelephone?: string;
  phoneNumber?: string;
  emailAddress?: string;
  email?: string;
};

function normalizeCarrier(c: FmcsaCarrier) {
  const phone = c.telephone || c.phyTelephone || c.phoneNumber || null;
  const email = c.emailAddress || c.email || null;
  return {
    dot: String(c.dotNumber || ""),
    legal_name: c.legalName || c.dbaName || "Unknown Carrier",
    dba_name: c.dbaName || null,
    state: c.phyState || "",
    city: c.phyCity || "",
    power_units: Number(c.totalPowerUnits || 0),
    drivers: Number(c.totalDrivers || 0),
    safety_rating: c.safetyRating || null,
    carrier_operation: c.carrierOperation || null,
    cargo_carried: c.cargoCarried || null,
    telephone: phone,
    email,
  };
}

function unwrapItems(json: unknown): FmcsaCarrier[] {
  const j = json as Record<string, unknown>;
  type FmcsaItem = { carrier?: FmcsaCarrier } | FmcsaCarrier;
  const items: FmcsaItem[] = Array.isArray(j.content)
    ? (j.content as FmcsaItem[])
    : (j as { content?: { carrier?: FmcsaCarrier } }).content?.carrier
      ? [{ carrier: (j as { content: { carrier: FmcsaCarrier } }).content.carrier }]
      : [];

  return items
    .map((item) => (item as { carrier?: FmcsaCarrier }).carrier ?? (item as FmcsaCarrier))
    .filter((c) => c.dotNumber);
}

async function fetchPage(url: string): Promise<FmcsaCarrier[]> {
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return [];
  const json = await res.json();
  return unwrapItems(json);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const name = searchParams.get("name") || "";
  const state = searchParams.get("state") || "";
  const dotNumber = searchParams.get("dot") || "";

  if (!FMCSA_KEY) {
    return NextResponse.json({ data: [], error: "FMCSA_WEB_KEY not configured" });
  }

  // DOT lookup — single result, no pagination needed
  if (dotNumber) {
    try {
      const res = await fetch(
        `${FMCSA_BASE}/carriers/${encodeURIComponent(dotNumber)}?webKey=${FMCSA_KEY}`,
        { next: { revalidate: 3600 } }
      );
      if (!res.ok) throw new Error(`FMCSA returned ${res.status}`);
      const raw = unwrapItems(await res.json());
      return NextResponse.json({ data: raw.map(normalizeCarrier) });
    } catch (err) {
      return NextResponse.json({ data: [], error: String(err) }, { status: 502 });
    }
  }

  if (!name) {
    return NextResponse.json({ data: [] });
  }

  // Fetch multiple pages in parallel to maximise contact-info hit rate
  const pageUrls = Array.from({ length: PAGES }, (_, i) =>
    `${FMCSA_BASE}/carriers/name/${encodeURIComponent(name)}?webKey=${FMCSA_KEY}&start=${i * PAGE_SIZE + 1}&size=${PAGE_SIZE}`
  );

  try {
    const pages = await Promise.allSettled(pageUrls.map(fetchPage));
    const allRaw = pages.flatMap((p) => (p.status === "fulfilled" ? p.value : []));

    // Deduplicate by DOT
    const seen = new Set<string>();
    const unique = allRaw.filter((c) => {
      const key = String(c.dotNumber);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Apply state filter
    const filtered = state
      ? unique.filter((c) => (c.phyState || "").toUpperCase() === state.toUpperCase())
      : unique;

    return NextResponse.json({ data: filtered.map(normalizeCarrier) });
  } catch (err) {
    return NextResponse.json({ data: [], error: String(err) }, { status: 502 });
  }
}
