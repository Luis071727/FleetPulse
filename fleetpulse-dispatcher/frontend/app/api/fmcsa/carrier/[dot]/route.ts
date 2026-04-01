import { NextRequest, NextResponse } from "next/server";

const FMCSA_BASE = "https://mobile.fmcsa.dot.gov/qc/services";
const FMCSA_KEY = process.env.FMCSA_WEB_KEY || process.env.FMCSA_API_KEY || "";

export async function GET(
  _req: NextRequest,
  { params }: { params: { dot: string } }
) {
  const { dot } = params;
  if (!FMCSA_KEY) {
    return NextResponse.json({ data: null, error: "FMCSA_WEB_KEY not configured" });
  }

  try {
    const res = await fetch(
      `${FMCSA_BASE}/carriers/${encodeURIComponent(dot)}?webKey=${FMCSA_KEY}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) throw new Error(`FMCSA ${res.status}`);

    const json = await res.json();
    const c = json.content?.carrier;
    if (!c) return NextResponse.json({ data: null, error: "Not found" });

    return NextResponse.json({
      data: {
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
        mc_number: c.mcNumber || null,
        oos_date: c.oosDate || null,
      },
    });
  } catch (err) {
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
