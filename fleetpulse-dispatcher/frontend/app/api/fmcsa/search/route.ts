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
    // Return mock data when no key is configured
    return NextResponse.json({ data: getMockCarriers(state) });
  }

  try {
    let url: string;

    if (dotNumber) {
      url = `${FMCSA_BASE}/carriers/${encodeURIComponent(dotNumber)}?webKey=${FMCSA_KEY}`;
    } else if (name) {
      url = `${FMCSA_BASE}/carriers/name/${encodeURIComponent(name)}?webKey=${FMCSA_KEY}&start=1&size=20`;
    } else if (state) {
      url = `${FMCSA_BASE}/carriers/state/${encodeURIComponent(state)}?webKey=${FMCSA_KEY}&start=1&size=20`;
    } else {
      return NextResponse.json({ data: getMockCarriers("") });
    }

    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`FMCSA ${res.status}`);

    const json = await res.json();
    const raw: FmcsaCarrier[] = Array.isArray(json.content)
      ? json.content
      : json.content?.carrier
        ? [json.content.carrier]
        : [];

    const carriers = raw.map(normalizeCarrier);
    return NextResponse.json({ data: carriers });
  } catch {
    // Fall through to mock data on FMCSA errors
    return NextResponse.json({ data: getMockCarriers(state) });
  }
}

function getMockCarriers(stateFilter: string) {
  const mocks = [
    { dot: "3521841", legal_name: "Blue Ridge Freight LLC", dba_name: null, state: "TN", city: "Nashville", power_units: 12, drivers: 14, safety_rating: "Satisfactory", carrier_operation: "Interstate", cargo_carried: "General Freight, Refrigerated Food", telephone: "615-555-0142", email: null },
    { dot: "2987654", legal_name: "Lone Star Transport Inc", dba_name: "LST", state: "TX", city: "Dallas", power_units: 28, drivers: 31, safety_rating: "Satisfactory", carrier_operation: "Interstate", cargo_carried: "General Freight, Building Materials", telephone: "214-555-0198", email: null },
    { dot: "1823456", legal_name: "Pacific Haul Co", dba_name: null, state: "CA", city: "Fresno", power_units: 6, drivers: 7, safety_rating: null, carrier_operation: "Interstate", cargo_carried: "Produce, Refrigerated Food", telephone: "559-555-0177", email: null },
    { dot: "4102938", legal_name: "Great Lakes Logistics", dba_name: "GLL", state: "OH", city: "Columbus", power_units: 45, drivers: 50, safety_rating: "Satisfactory", carrier_operation: "Interstate", cargo_carried: "General Freight, Metal Sheets", telephone: "614-555-0211", email: null },
    { dot: "3309876", legal_name: "Southern Express Carriers", dba_name: null, state: "GA", city: "Atlanta", power_units: 19, drivers: 22, safety_rating: "Satisfactory", carrier_operation: "Interstate", cargo_carried: "General Freight, Paper Products", telephone: "404-555-0133", email: null },
    { dot: "2765432", legal_name: "Mountain West Trucking", dba_name: null, state: "CO", city: "Denver", power_units: 9, drivers: 10, safety_rating: null, carrier_operation: "Interstate", cargo_carried: "General Freight, Construction Materials", telephone: "720-555-0189", email: null },
  ];
  if (!stateFilter) return mocks;
  return mocks.filter((c) => c.state.toUpperCase() === stateFilter.toUpperCase());
}
