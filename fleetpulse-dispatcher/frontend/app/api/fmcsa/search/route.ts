import { NextRequest, NextResponse } from "next/server";

const SOCRATA_URL = "https://data.transportation.gov/resource/kjg3-diqy.json";
const SELECT_COLS = [
  "dot_number", "legal_name", "dba_name", "phy_city", "phy_state", "phy_zip",
  "telephone", "email_address", "nbr_power_unit", "driver_total",
  "carrier_operation", "authorized_for_hire", "hm_flag", "pc_flag",
  "add_date", "mcs150_date", "mcs150_mileage",
].join(",");

type SocrataCarrier = {
  dot_number?: string;
  legal_name?: string;
  dba_name?: string;
  phy_city?: string;
  phy_state?: string;
  phy_zip?: string;
  telephone?: string;
  email_address?: string;
  nbr_power_unit?: string;
  driver_total?: string;
  carrier_operation?: string;
  authorized_for_hire?: string;
  hm_flag?: string;
  pc_flag?: string;
  add_date?: string;
  mcs150_date?: string;
  mcs150_mileage?: string;
};

function normalizeCarrier(c: SocrataCarrier) {
  return {
    dot_number: c.dot_number || "",
    legal_name: c.legal_name || c.dba_name || "Unknown Carrier",
    dba_name: c.dba_name || null,
    city: c.phy_city || "",
    state: c.phy_state || "",
    zip: c.phy_zip || "",
    telephone: c.telephone || null,
    email: c.email_address || null,
    power_units: parseInt(c.nbr_power_unit || "0", 10),
    drivers: parseInt(c.driver_total || "0", 10),
    carrier_operation: c.carrier_operation || null,
    authorized_for_hire: c.authorized_for_hire === "Y",
    hauls_hazmat: c.hm_flag === "Y",
    is_passenger: c.pc_flag === "Y",
    add_date: c.add_date || null,
    last_filing: c.mcs150_date || null,
    annual_mileage: parseInt(c.mcs150_mileage || "0", 10),
    has_phone: !!c.telephone,
    has_email: !!c.email_address,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const name = searchParams.get("name") || "";
  const state = searchParams.get("state") || "";
  const minTrucks = searchParams.get("min_trucks") || "";
  const maxTrucks = searchParams.get("max_trucks") || "";
  const phoneOnly = searchParams.get("phone_only") === "1";
  const emailOnly = searchParams.get("email_only") === "1";
  const hireOnly = searchParams.get("hire_only") === "1";
  const hazmat = searchParams.get("hazmat") === "1";
  const newEntrants = searchParams.get("new_entrants") === "1";
  const sortBy = searchParams.get("sort_by") || "trucks";
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const where: string[] = [];

  if (name) {
    if (/^\d+$/.test(name.trim())) {
      where.push(`dot_number='${name.trim()}'`);
    } else {
      const sanitized = name.trim().replace(/'/g, "''").toUpperCase();
      where.push(`upper(legal_name) like '%${sanitized}%'`);
    }
  }

  if (state) {
    where.push(`phy_state='${state.toUpperCase()}'`);
  }

  if (minTrucks) {
    where.push(`nbr_power_unit >= '${minTrucks}'`);
  }

  if (maxTrucks) {
    where.push(`nbr_power_unit <= '${maxTrucks}'`);
  }

  if (phoneOnly) {
    where.push("telephone IS NOT NULL");
  }

  if (emailOnly) {
    where.push("email_address IS NOT NULL");
  }

  if (hireOnly) {
    where.push("authorized_for_hire='Y'");
  }

  if (hazmat) {
    where.push("hm_flag='Y'");
  }

  if (newEntrants) {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    where.push(`add_date >= '${cutoff.toISOString().split("T")[0]}'`);
  }

  // Require at least one filter to avoid querying the entire dataset
  if (where.length === 0) {
    return NextResponse.json({ results: [], total: 0, offset: 0, limit, has_more: false });
  }

  const orderCol =
    sortBy === "drivers" ? "driver_total"
    : sortBy === "date" ? "add_date"
    : "nbr_power_unit";
  const orderDir = sortBy === "date" ? "ASC" : "DESC";

  const params = new URLSearchParams({
    $select: SELECT_COLS,
    $where: where.join(" AND "),
    $order: `${orderCol} ${orderDir}`,
    $limit: String(limit),
    $offset: String(offset),
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${SOCRATA_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: 300 },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { results: [], error: `Socrata returned ${res.status}` },
        { status: 502 }
      );
    }

    const raw = (await res.json()) as SocrataCarrier[];
    const results = raw.map(normalizeCarrier);

    return NextResponse.json({
      results,
      total: results.length + offset,
      offset,
      limit,
      has_more: results.length === limit,
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { results: [], error: isTimeout ? "Search timed out. Please try again." : String(err) },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
