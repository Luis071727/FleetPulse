"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Truck, SearchTruck } from "../../../components/icons";
import OutreachModal from "../../../components/OutreachModal";
import DispatcherSetupModal from "../../../components/DispatcherSetupModal";

type Carrier = {
  dot: string;
  legal_name: string;
  dba_name: string | null;
  state: string;
  city: string;
  power_units: number;
  drivers: number;
  safety_rating: string | null;
  carrier_operation: string | null;
  cargo_carried: string | null;
  telephone: string | null;
  email: string | null;
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

const FLEET_BUCKETS = [
  { label: "Any Size", min: 0, max: Infinity },
  { label: "Owner-Op (1–2)", min: 1, max: 2 },
  { label: "Small (3–10)", min: 3, max: 10 },
  { label: "Medium (11–50)", min: 11, max: 50 },
  { label: "Large (51+)", min: 51, max: Infinity },
];

function safetyColor(rating: string | null) {
  if (!rating) return "#64748b";
  if (rating.toLowerCase().includes("satisfactory")) return "#22c55e";
  if (rating.toLowerCase().includes("conditional")) return "#f59e0b";
  if (rating.toLowerCase().includes("unsatisfactory")) return "#ef4444";
  return "#64748b";
}

function carrierInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}

function parseCargo(cargo: string | null): string[] {
  if (!cargo) return [];
  return cargo.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
}

function CarrierSkeleton() {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 12, padding: 20, border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div className="fp-skeleton" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="fp-skeleton" style={{ height: 14, borderRadius: 6, marginBottom: 8, width: "70%" }} />
          <div className="fp-skeleton" style={{ height: 11, borderRadius: 6, width: "45%" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="fp-skeleton" style={{ flex: 1, height: 42, borderRadius: 8 }} />
        ))}
      </div>
      <div className="fp-skeleton" style={{ height: 30, borderRadius: 8, width: "100%" }} />
    </div>
  );
}

function CarrierCard({
  carrier,
  onOutreach,
  animDelay,
}: {
  carrier: Carrier;
  onOutreach: (c: Carrier) => void;
  animDelay: number;
}) {
  const [copiedDot, setCopiedDot] = useState(false);
  const cargo = parseCargo(carrier.cargo_carried);

  const handleCopyDot = async () => {
    await navigator.clipboard.writeText(carrier.dot);
    setCopiedDot(true);
    setTimeout(() => setCopiedDot(false), 1500);
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 12,
        padding: 20,
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        animation: `fadeUp 0.3s ease both`,
        animationDelay: `${animDelay}ms`,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, background: "var(--surface2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 700, color: "var(--amber)", flexShrink: 0,
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          {carrierInitials(carrier.legal_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {carrier.legal_name}
          </div>
          <div style={{ fontSize: 11, color: "var(--mist)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
            <MapPin size={11} />
            {carrier.city ? `${carrier.city}, ` : ""}{carrier.state}
          </div>
        </div>
        {carrier.safety_rating && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
            background: `${safetyColor(carrier.safety_rating)}22`,
            color: safetyColor(carrier.safety_rating),
            border: `1px solid ${safetyColor(carrier.safety_rating)}44`,
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {carrier.safety_rating}
          </span>
        )}
      </div>

      {/* Metrics strip */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <MetricTile icon={<Truck size={13} />} label="Trucks" value={String(carrier.power_units)} />
        <MetricTile label="Drivers" value={String(carrier.drivers)} />
        {carrier.dot && <MetricTile label="DOT" value={`#${carrier.dot}`} mono />}
      </div>

      {/* Cargo tags */}
      {cargo.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
          {cargo.map((tag) => (
            <span key={tag} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--surface2)", color: "var(--mistLt)", border: "1px solid var(--border2)" }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Contact row */}
      <div style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
        {carrier.telephone && (
          <span style={{ fontSize: 12, color: "var(--mist)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {carrier.telephone}
          </span>
        )}
        <button
          type="button"
          onClick={handleCopyDot}
          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: copiedDot ? "var(--green)" : "var(--mist)", cursor: "pointer", whiteSpace: "nowrap" }}
        >
          {copiedDot ? "Copied!" : "Copy DOT"}
        </button>
        <button
          type="button"
          onClick={() => onOutreach(carrier)}
          style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, border: "none", background: "var(--blue)", color: "#000", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}
        >
          Write Outreach
        </button>
      </div>
    </div>
  );
}

function MetricTile({ label, value, icon, mono }: { label: string; value: string; icon?: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ flex: 1, background: "var(--surface2)", borderRadius: 8, padding: "6px 8px", minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "var(--mist)", display: "flex", alignItems: "center", gap: 3, marginBottom: 2 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--white)", fontFamily: mono ? "'IBM Plex Mono', monospace" : "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

export default function FindCarriersPage() {
  const [nameQuery, setNameQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [fleetBucket, setFleetBucket] = useState(0);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [outreachCarrier, setOutreachCarrier] = useState<Carrier | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [pendingOutreachCarrier, setPendingOutreachCarrier] = useState<Carrier | null>(null);
  const [dispatcherName, setDispatcherName] = useState("");
  const [dispatcherCompany, setDispatcherCompany] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDispatcherName(localStorage.getItem("fp_dispatcher_name") || "");
      setDispatcherCompany(localStorage.getItem("fp_dispatcher_company") || "");
      localStorage.setItem("fp_find_carriers_visited", "1");
    }
  }, []);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    setSearchError("");
    try {
      const params = new URLSearchParams();
      if (nameQuery.trim()) params.set("name", nameQuery.trim());
      if (stateFilter) params.set("state", stateFilter);

      const res = await fetch(`/api/fmcsa/search?${params.toString()}`);
      const json = await res.json() as { data?: Carrier[]; error?: string };

      if (json.error) {
        setSearchError(json.error);
        setCarriers([]);
        return;
      }

      let results = json.data || [];

      // Client-side fleet size filter
      const bucket = FLEET_BUCKETS[fleetBucket];
      if (bucket.min > 0) {
        results = results.filter((c) => c.power_units >= bucket.min && c.power_units <= bucket.max);
      }

      setCarriers(results);
    } catch (err) {
      setSearchError(String(err));
      setCarriers([]);
    } finally {
      setLoading(false);
    }
  }, [nameQuery, stateFilter, fleetBucket]);

  const handleOutreach = (carrier: Carrier) => {
    if (!dispatcherName) {
      setPendingOutreachCarrier(carrier);
      setShowSetup(true);
    } else {
      setOutreachCarrier(carrier);
    }
  };

  const handleSetupSaved = (name: string, company: string) => {
    setDispatcherName(name);
    setDispatcherCompany(company);
    setShowSetup(false);
    if (pendingOutreachCarrier) {
      setOutreachCarrier(pendingOutreachCarrier);
      setPendingOutreachCarrier(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void handleSearch();
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px", fontWeight: 600, display: "flex", alignItems: "center", gap: 9 }}>
          <SearchTruck size={22} style={{ color: "var(--blue)" }} />
          Find Carriers
        </h1>
        <p style={{ fontSize: 13, color: "var(--mist)", margin: 0 }}>
          Search FMCSA-registered carriers by name, state, or fleet size. Generate AI outreach in one click.
        </p>
      </div>

      {/* Search bar */}
      <div style={{ background: "var(--surface)", borderRadius: 12, padding: "16px 18px", border: "1px solid var(--border)", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by carrier name…"
            style={{ flex: "1 1 220px", padding: "9px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 14, minWidth: 0 }}
          />
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={{ padding: "9px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 14, minWidth: 130 }}
          >
            <option value="">All States</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={fleetBucket}
            onChange={(e) => setFleetBucket(Number(e.target.value))}
            style={{ padding: "9px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 14, minWidth: 160 }}
          >
            {FLEET_BUCKETS.map((b, i) => <option key={i} value={i}>{b.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={loading}
            style={{ padding: "9px 22px", borderRadius: 7, border: "none", background: "var(--amber)", color: "#000", fontSize: 14, fontWeight: 700, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1, whiteSpace: "nowrap" }}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {loading && (
          <p style={{ fontSize: 12, color: "var(--mist)", margin: "10px 0 0" }}>
            ⏱ First search may take 15–20 s while FMCSA API warms up…
          </p>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => <CarrierSkeleton key={i} />)}
        </div>
      ) : searchError ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mist)" }}>
          <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px", color: "var(--red)" }}>Search unavailable</p>
          <p style={{ fontSize: 13, margin: 0 }}>{searchError}</p>
        </div>
      ) : searched && carriers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mist)" }}>
          <SearchTruck size={40} style={{ color: "var(--border)", marginBottom: 12 }} />
          <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px", color: "var(--white)" }}>No carriers found</p>
          <p style={{ fontSize: 13, margin: 0 }}>Try a different name, state, or fleet size filter.</p>
        </div>
      ) : !searched ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mist)" }}>
          <SearchTruck size={40} style={{ color: "var(--border)", marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px", color: "var(--white)" }}>Search for carriers</p>
          <p style={{ fontSize: 13, margin: 0 }}>Enter a carrier name, select a state, or filter by fleet size and click Search.</p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 12 }}>
            {carriers.length} carrier{carriers.length !== 1 ? "s" : ""} found
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {carriers.map((c, i) => (
              <CarrierCard
                key={c.dot || i}
                carrier={c}
                onOutreach={handleOutreach}
                animDelay={i * 40}
              />
            ))}
          </div>
        </>
      )}

      {/* Outreach Modal */}
      {outreachCarrier && (
        <OutreachModal
          carrier={outreachCarrier}
          dispatcherName={dispatcherName}
          dispatcherCompany={dispatcherCompany}
          onClose={() => setOutreachCarrier(null)}
        />
      )}

      {/* Dispatcher Setup Modal */}
      {showSetup && (
        <DispatcherSetupModal
          onSaved={handleSetupSaved}
          onClose={() => { setShowSetup(false); setPendingOutreachCarrier(null); }}
        />
      )}
    </div>
  );
}
