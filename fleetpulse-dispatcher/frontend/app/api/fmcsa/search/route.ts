import { NextRequest, NextResponse } from "next/server";

const FMCSA_BASE = "https://mobile.fmcsa.dot.gov/qc/services";
const FMCSA_KEY = process.env.FMCSA_WEB_KEY || process.env.FMCSA_API_KEY || "";

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
  // Phone can appear under multiple field names depending on endpoint
  telephone?: string;
  phyTelephone?: string;
  phoneNumber?: string;
  // Email
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

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const name = searchParams.get("name") || "";
  const state = searchParams.get("state") || "";
  const dotNumber = searchParams.get("dot") || "";

  if (!FMCSA_KEY) {
    return NextResponse.json({ data: [], error: "FMCSA_WEB_KEY not configured" });
  }

  // Require at least a name, DOT, or state
  if (!dotNumber && !name && !state) {
    return NextResponse.json({ data: [] });
  }

  let url: string;
  if (dotNumber) {
    url = `${FMCSA_BASE}/carriers/${encodeURIComponent(dotNumber)}?webKey=${FMCSA_KEY}`;
  } else if (name) {
    url = `${FMCSA_BASE}/carriers/name/${encodeURIComponent(name)}?webKey=${FMCSA_KEY}&start=1&size=50`;
  } else {
    // State-only search — returns first page of carriers in that state
    url = `${FMCSA_BASE}/carriers/state/${encodeURIComponent(state)}?webKey=${FMCSA_KEY}&start=1&size=50`;
  }

  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`FMCSA returned ${res.status}`);

    const json = await res.json();
    let raw = unwrapItems(json);

    // Apply state filter client-side (FMCSA name search doesn't support state scoping)
    if (state) {
      raw = raw.filter((c) => (c.phyState || "").toUpperCase() === state.toUpperCase());
    }

    return NextResponse.json({ data: raw.map(normalizeCarrier) });
  } catch (err) {
    return NextResponse.json({ data: [], error: String(err) }, { status: 502 });
  }
}
