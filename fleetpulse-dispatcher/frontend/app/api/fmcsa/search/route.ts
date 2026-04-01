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
  telephone?: string;
  emailAddress?: string;
};

function normalizeCarrier(c: FmcsaCarrier) {
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
    telephone: c.telephone || null,
    email: c.emailAddress || null,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const name = searchParams.get("name") || "";
  const state = searchParams.get("state") || "";
  const dotNumber = searchParams.get("dot") || "";

  if (!FMCSA_KEY) {
    return NextResponse.json({ data: [], error: "FMCSA_WEB_KEY not configured" });
  }

  if (!dotNumber && !name && !state) {
    return NextResponse.json({ data: [] });
  }

  let url: string;
  if (dotNumber) {
    url = `${FMCSA_BASE}/carriers/${encodeURIComponent(dotNumber)}?webKey=${FMCSA_KEY}`;
  } else if (name) {
    url = `${FMCSA_BASE}/carriers/name/${encodeURIComponent(name)}?webKey=${FMCSA_KEY}&start=1&size=20`;
  } else {
    url = `${FMCSA_BASE}/carriers/state/${encodeURIComponent(state)}?webKey=${FMCSA_KEY}&start=1&size=20`;
  }

  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`FMCSA returned ${res.status}`);

    const json = await res.json();
    const raw: FmcsaCarrier[] = Array.isArray(json.content)
      ? json.content
      : json.content?.carrier
        ? [json.content.carrier]
        : [];

    return NextResponse.json({ data: raw.map(normalizeCarrier) });
  } catch (err) {
    return NextResponse.json({ data: [], error: String(err) }, { status: 502 });
  }
}
