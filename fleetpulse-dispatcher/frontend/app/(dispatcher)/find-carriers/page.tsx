"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Truck, SearchTruck } from "../../../components/icons";
import OutreachModal from "../../../components/OutreachModal";
import DispatcherSetupModal from "../../../components/DispatcherSetupModal";

type Carrier = {
  dot_number: string;
  legal_name: string;
  dba_name: string | null;
  city: string;
  state: string;
  zip: string;
  telephone: string | null;
  email: string | null;
  power_units: number;
  drivers: number;
  carrier_operation: string | null;
  authorized_for_hire: boolean;
  hauls_hazmat: boolean;
  is_passenger: boolean;
  add_date: string | null;
  last_filing: string | null;
  annual_mileage: number;
  has_phone: boolean;
  has_email: boolean;
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

const FLEET_BUCKETS = [
  { label: "Any Size", min: 0, max: 0 },
  { label: "Owner-Op (1)", min: 1, max: 1 },
  { label: "Small (2–5)", min: 2, max: 5 },
  { label: "Medium (6–15)", min: 6, max: 15 },
  { label: "Large (16–50)", min: 16, max: 50 },
];

function formatPhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function mcs150Age(lastFiling: string | null): { label: string; color: string } | null {
  if (!lastFiling) return null;
  const months = Math.floor((Date.now() - new Date(lastFiling).getTime()) / (1000 * 60 * 60 * 24 * 30));
  if (months > 24) return { label: `Filed ${Math.floor(months / 12)}y ago`, color: "var(--red)" };
  if (months > 12) return { label: `Filed ${months}mo ago`, color: "var(--amber)" };
  return { label: `Filed ${months}mo ago`, color: "var(--green)" };
}

function carrierInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="fp-skeleton" style={{ height: 42, borderRadius: 8 }} />
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
  const filingInfo = mcs150Age(carrier.last_filing);

  const handleCopyDot = async () => {
    await navigator.clipboard.writeText(carrier.dot_number);
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
          {carrier.dba_name && carrier.dba_name !== carrier.legal_name && (
            <div style={{ fontSize: 11, color: "var(--mist)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              dba {carrier.dba_name}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--mist)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
            <MapPin size={11} />
            {carrier.city ? `${carrier.city}, ` : ""}{carrier.state}{carrier.zip ? ` ${carrier.zip}` : ""}
          </div>
        </div>
        {filingInfo && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10,
            background: `${filingInfo.color}22`,
            color: filingInfo.color,
            border: `1px solid ${filingInfo.color}44`,
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {filingInfo.label}
          </span>
        )}
      </div>

      {/* 4-col metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
        <MetricTile icon={<Truck size={12} />} label="Trucks" value={String(carrier.power_units)} />
        <MetricTile label="Drivers" value={String(carrier.drivers)} />
        <MetricTile label="DOT" value={`#${carrier.dot_number}`} mono />
        <MetricTile label="Operation" value={carrier.carrier_operation || "—"} />
      </div>

      {/* Badges */}
      {(carrier.authorized_for_hire || carrier.hauls_hazmat || carrier.is_passenger || !carrier.authorized_for_hire) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          {carrier.authorized_for_hire ? (
            <Badge label="For Hire" color="var(--blue)" />
          ) : (
            <Badge label="Private Fleet" color="var(--mist)" />
          )}
          {carrier.hauls_hazmat && <Badge label="HazMat" color="var(--amber)" />}
          {carrier.is_passenger && <Badge label="Passenger" color="var(--green)" />}
        </div>
      )}

      {/* Contact info */}
      <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 3 }}>
        {carrier.telephone && (
          <span style={{ fontSize: 12, color: "var(--mistLt)" }}>📞 {formatPhone(carrier.telephone)}</span>
        )}
        {carrier.email && (
          <span style={{ fontSize: 12, color: "var(--mistLt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✉ {carrier.email}</span>
        )}
        {!carrier.telephone && !carrier.email && (
          <span style={{ fontSize: 12, color: "var(--mist)", fontStyle: "italic" }}>No contact info on file</span>
        )}
      </div>

      {/* Action row */}
      <div style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
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
    <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "6px 8px", minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "var(--mist)", display: "flex", alignItems: "center", gap: 3, marginBottom: 2 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--white)", fontFamily: mono ? "'IBM Plex Mono', monospace" : "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${color}22`, color, border: `1px solid ${color}44`, fontWeight: 600, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontWeight: 500,
        background: active ? "rgba(56,189,248,0.12)" : "transparent",
        border: `1px solid ${active ? "var(--blue)" : "var(--border)"}`,
        color: active ? "var(--blue)" : "var(--mist)",
        transition: "all 0.15s", whiteSpace: "nowrap",
      }}
    >
      <span>{active ? "✓" : "○"}</span>
      {label}
    </button>
  );
}

export default function FindCarriersPage() {
  const [nameQuery, setNameQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [fleetBucket, setFleetBucket] = useState(0);
  const [phoneOnly, setPhoneOnly] = useState(true);
  const [emailOnly, setEmailOnly] = useState(false);
  const [hireOnly, setHireOnly] = useState(false);
  const [hazmat, setHazmat] = useState(false);
  const [newEntrants, setNewEntrants] = useState(false);
  const [sortBy, setSortBy] = useState("trucks");

  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);

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

  const canSearch = nameQuery.trim().length >= 1 || stateFilter !== "";

  const buildParams = useCallback((offset = 0) => {
    const params = new URLSearchParams();
    if (nameQuery.trim()) params.set("name", nameQuery.trim());
    if (stateFilter) params.set("state", stateFilter);

    const bucket = FLEET_BUCKETS[fleetBucket];
    if (bucket.min > 0) params.set("min_trucks", String(bucket.min));
    if (bucket.max > 0) params.set("max_trucks", String(bucket.max));

    if (phoneOnly) params.set("phone_only", "1");
    if (emailOnly) params.set("email_only", "1");
    if (hireOnly) params.set("hire_only", "1");
    if (hazmat) params.set("hazmat", "1");
    if (newEntrants) params.set("new_entrants", "1");
    params.set("sort_by", sortBy);
    params.set("limit", "50");
    params.set("offset", String(offset));
    return params;
  }, [nameQuery, stateFilter, fleetBucket, phoneOnly, emailOnly, hireOnly, hazmat, newEntrants, sortBy]);

  const handleSearch = useCallback(async () => {
    if (!canSearch) return;
    setLoading(true);
    setSearched(true);
    setSearchError("");
    setCurrentOffset(0);
    setCarriers([]);

    try {
      const params = buildParams(0);
      const res = await fetch(`/api/fmcsa/search?${params.toString()}`);
      const json = await res.json() as { results?: Carrier[]; error?: string; has_more?: boolean };

      if (json.error) {
        setSearchError(json.error);
        return;
      }

      setCarriers(json.results || []);
      setHasMore(json.has_more || false);
      setCurrentOffset(50);
    } catch (err) {
      setSearchError(String(err));
    } finally {
      setLoading(false);
    }
  }, [canSearch, buildParams]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const params = buildParams(currentOffset);
      const res = await fetch(`/api/fmcsa/search?${params.toString()}`);
      const json = await res.json() as { results?: Carrier[]; error?: string; has_more?: boolean };

      if (!json.error) {
        setCarriers((prev) => [...prev, ...(json.results || [])]);
        setHasMore(json.has_more || false);
        setCurrentOffset((prev) => prev + 50);
      }
    } catch {
      // silently ignore load-more errors
    } finally {
      setLoadingMore(false);
    }
  }, [currentOffset, buildParams]);

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
          Search 600,000+ DOT-registered carriers. Filter by contact info, state, and fleet size — then generate AI outreach in one click.
        </p>
      </div>

      {/* Filter panel */}
      <div style={{ background: "var(--surface)", borderRadius: 12, padding: "16px 18px", border: "1px solid var(--border)", marginBottom: 20 }}>
        {/* Row 1: State, Fleet Size, Sort */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 13, minWidth: 130 }}
          >
            <option value="">All States</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={fleetBucket}
            onChange={(e) => setFleetBucket(Number(e.target.value))}
            style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 13, minWidth: 155 }}
          >
            {FLEET_BUCKETS.map((b, i) => <option key={i} value={i}>{b.label}</option>)}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 13, minWidth: 140 }}
          >
            <option value="trucks">Sort: Trucks ↓</option>
            <option value="drivers">Sort: Drivers ↓</option>
            <option value="date">Sort: Newest</option>
          </select>
        </div>

        {/* Row 2: Toggle chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <FilterChip label="Has Phone" active={phoneOnly} onClick={() => setPhoneOnly((v) => !v)} />
          <FilterChip label="Has Email" active={emailOnly} onClick={() => setEmailOnly((v) => !v)} />
          <FilterChip label="For Hire Only" active={hireOnly} onClick={() => setHireOnly((v) => !v)} />
          <FilterChip label="HazMat" active={hazmat} onClick={() => setHazmat((v) => !v)} />
          <FilterChip label="New Entrants" active={newEntrants} onClick={() => setNewEntrants((v) => !v)} />
        </div>

        {/* Row 3: Name search + button */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Carrier name or DOT number…"
            style={{ flex: 1, padding: "9px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 14, minWidth: 0 }}
          />
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={loading || !canSearch}
            style={{ padding: "9px 22px", borderRadius: 7, border: "none", background: "var(--amber)", color: "#000", fontSize: 14, fontWeight: 700, cursor: (loading || !canSearch) ? "not-allowed" : "pointer", opacity: (loading || !canSearch) ? 0.5 : 1, whiteSpace: "nowrap" }}
          >
            {loading ? "Searching…" : "Find Carriers"}
          </button>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => <CarrierSkeleton key={i} />)}
        </div>
      ) : searchError ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mist)" }}>
          <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px", color: "var(--red)" }}>Search unavailable</p>
          <p style={{ fontSize: 13, margin: "0 0 14px" }}>{searchError}</p>
          <button
            type="button"
            onClick={() => void handleSearch()}
            style={{ padding: "8px 18px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--white)", fontSize: 13, cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      ) : !searched ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mist)" }}>
          <SearchTruck size={40} style={{ color: "var(--border)", marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px", color: "var(--white)" }}>Find your next carrier</p>
          <p style={{ fontSize: 13, margin: "0 0 6px" }}>Select a state or type a name/DOT to search 600k+ registered carriers.</p>
          <p style={{ fontSize: 12, color: "var(--mist)", margin: 0 }}>Tip: Enable "Has Phone" to only show carriers with contact info.</p>
        </div>
      ) : carriers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mist)" }}>
          <SearchTruck size={40} style={{ color: "var(--border)", marginBottom: 12 }} />
          <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px", color: "var(--white)" }}>No carriers found</p>
          <p style={{ fontSize: 13, margin: "0 0 14px" }}>
            {phoneOnly ? "Try turning off 'Has Phone' or broadening your search." : "Try a different name, state, or fleet size."}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {phoneOnly && (
              <button
                type="button"
                onClick={() => { setPhoneOnly(false); setTimeout(() => void handleSearch(), 0); }}
                style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--white)", fontSize: 12, cursor: "pointer" }}
              >
                Remove phone filter
              </button>
            )}
            {stateFilter && (
              <button
                type="button"
                onClick={() => { setStateFilter(""); setTimeout(() => void handleSearch(), 0); }}
                style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--white)", fontSize: 12, cursor: "pointer" }}
              >
                Search all states
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: "var(--mist)", margin: 0 }}>
              {carriers.length} carrier{carriers.length !== 1 ? "s" : ""} found
              {hasMore && " · more available"}
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {carriers.map((c, i) => (
              <CarrierCard
                key={c.dot_number || i}
                carrier={c}
                onOutreach={handleOutreach}
                animDelay={Math.min(i * 40, 400)}
              />
            ))}
          </div>
          {hasMore && (
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--white)", fontSize: 14, cursor: loadingMore ? "wait" : "pointer", opacity: loadingMore ? 0.6 : 1 }}
              >
                {loadingMore ? "Loading…" : "Load More"}
              </button>
            </div>
          )}
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
