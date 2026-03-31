"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCarrier,
  listCarriers,
  inviteCarrier,
  loadRosterViewPreference,
  saveRosterViewPreference,
  type RosterView,
} from "../../../services/api";
import AddCarrierModal from "../../../components/AddCarrierModal";
import CarrierDetailModal from "../../../components/CarrierDetailModal";
import { X } from "../../../components/icons";

type Carrier = Record<string, unknown>;

const STATUS_FILTERS = ["all", "active", "idle", "issues", "portal_active"];

export default function CarrierRosterPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("legal_name");
  const [view, setView] = useState<RosterView>("grid");
  const [loading, setLoading] = useState(true);
  const [selectedCarrier, setSelectedCarrier] = useState<Carrier | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [quickInviteCarrier, setQuickInviteCarrier] = useState<Carrier | null>(null);
  const [quickInviteEmail, setQuickInviteEmail] = useState("");
  const [quickInviteMsg, setQuickInviteMsg] = useState("");
  const [quickInviteLoading, setQuickInviteLoading] = useState(false);

  useEffect(() => {
    setView(loadRosterViewPreference());
  }, []);

  // Escape key to close detail drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedCarrier(null);
    };
    if (selectedCarrier) {
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
  }, [selectedCarrier]);

  const fetchCarriers = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = statusFilter === "all" || statusFilter === "portal_active" ? undefined : statusFilter;
      const res = await listCarriers({
        search: search || undefined,
        status: statusParam,
        sort_by: sortBy,
      });
      let data = (res.data as Carrier[]) || [];
      if (statusFilter === "portal_active") data = data.filter((c) => c.portal_status === "active");
      setCarriers(data);
      setTotal((res.meta?.total as number) || data.length);
    } catch {
      /* network error */
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sortBy]);

  useEffect(() => {
    fetchCarriers();
  }, [fetchCarriers]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const carrierId = new URLSearchParams(window.location.search).get("carrierId");
    if (!carrierId) return;

    const existing = carriers.find((carrier) => carrier.id === carrierId);
    if (existing) {
      setSelectedCarrier(existing);
      return;
    }

    getCarrier(carrierId).then((res) => {
      if (res.data) {
        setSelectedCarrier(res.data as Carrier);
      }
    }).catch(() => {});
  }, [carriers]);

  const clearCarrierQuery = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.delete("carrierId");
    const next = params.toString();
    const target = next ? `/carriers?${next}` : "/carriers";
    window.history.replaceState(null, "", target);
  }, []);

  const handleViewToggle = (v: RosterView) => {
    setView(v);
    saveRosterViewPreference(v);
  };

  const openQuickInvite = (carrier: Carrier) => {
    setQuickInviteCarrier(carrier);
    setQuickInviteEmail(String(carrier.contact_email || carrier.email || ""));
    setQuickInviteMsg("");
  };

  const closeQuickInvite = () => {
    setQuickInviteCarrier(null);
    setQuickInviteEmail("");
    setQuickInviteMsg("");
    setQuickInviteLoading(false);
  };

  const handleQuickInvite = async () => {
    if (!quickInviteCarrier?.id || !quickInviteEmail.trim()) return;
    setQuickInviteLoading(true);
    const res = await inviteCarrier(quickInviteCarrier.id as string, quickInviteEmail.trim());
    if (res.error) {
      setQuickInviteMsg(res.error);
      setQuickInviteLoading(false);
      return;
    }

    setQuickInviteMsg("Invite sent!");
    setSelectedCarrier((prev) => (
      prev?.id === quickInviteCarrier.id
        ? { ...prev, portal_status: "invited" }
        : prev
    ));
    await fetchCarriers();
    setQuickInviteLoading(false);
  };

  const inviteActionLabel = (carrier: Carrier) =>
    carrier.portal_status === "invited" ? "Resend Invite" : "Send Invite";

  const statusColor = (s: string) => {
    if (s === "active") return "var(--green)";
    if (s === "idle") return "var(--amber)";
    if (s === "issues") return "var(--red)";
    return "var(--mist)";
  };

  const uninvitedCount = carriers.filter((c) => !c.portal_status || c.portal_status === "not_invited").length;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>Carriers</h1>
        <button type="button" onClick={() => setShowAddModal(true)} style={btnPrimary}>
          + Add Carrier
        </button>
      </div>

      {/* Uninvited banner */}
      {uninvitedCount > 0 && (
        <div style={{ background: "#1e3a5f", borderRadius: 8, padding: "10px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
          <span>{uninvitedCount} carrier{uninvitedCount > 1 ? "s" : ""} not yet invited to portal</span>
        </div>
      )}

      {/* Search + filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Search name, MC, DOT, ELD…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            className={`fp-chip${statusFilter === f ? " fp-chip--active" : ""}`}
          >
            {f === "portal_active" ? "Portal Active" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button type="button" onClick={() => handleViewToggle("grid")}
            className={`fp-chip${view === "grid" ? " fp-chip--active" : ""}`}>Grid</button>
          <button type="button" onClick={() => handleViewToggle("list")}
            className={`fp-chip${view === "list" ? " fp-chip--active" : ""}`}>List</button>
        </span>
      </div>

      <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 10 }}>
        {loading ? "Loading…" : `${total} carrier${total !== 1 ? "s" : ""}`}
      </p>

      {/* Grid / List view */}
      {view === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
          {carriers.map((c) => {
            const st = (c.computed_status as string) || (c.status as string) || "new";
            const isSelected = selectedCarrier?.id === c.id;
            return (
              <div key={c.id as string} onClick={() => setSelectedCarrier(c)}
                style={{
                  ...cardStyle,
                  borderColor: isSelected ? "var(--amber)" : "var(--border)",
                  borderWidth: isSelected ? 2 : 1,
                }}>
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", background: "var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, fontWeight: 700, color: "var(--blue)",
                    }}>
                      {((c.legal_name as string) || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <strong style={{ fontSize: 14 }}>{(c.legal_name as string) || "Unknown"}</strong>
                      <p className="fp-mono" style={{ fontSize: 11, color: "var(--mist)", margin: 0 }}>
                        {c.mc_number ? `MC ${c.mc_number}` : ""}{c.dot_number ? ` DOT ${c.dot_number}` : ""}
                      </p>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                    background: `${statusColor(st)}22`, color: statusColor(st), textTransform: "uppercase" as const,
                  }}>{st}</span>
                  {c.verification_status === "unverified" && (
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                      background: "#f59e0b22", color: "#f59e0b", textTransform: "uppercase" as const, marginTop: 4,
                    }}>Not Verified</span>
                  )}
                </div>

                {/* Metric tiles */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <MiniMetric label="AR" value="$0" />
                  <MiniMetric label="IRS" value="—" />
                  <MiniMetric label="Trucks" value={String(c.power_units || "—")} />
                </div>

                {/* Portal status + actions */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: c.portal_status === "active" ? "var(--green)" : "var(--mist)" }}>
                    {c.portal_status === "active" ? "Portal Active" : c.portal_status === "invited" ? "Invite Sent" : "Not Invited"}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {c.portal_status !== "active" && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openQuickInvite(c); }}
                        style={{ ...btnSmall, color: "var(--amber)", borderColor: "var(--amber)" }}
                      >
                        {inviteActionLabel(c)}
                      </button>
                    )}
                    <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedCarrier(c); }} style={btnSmall}>Details</button>
                  </div>
                </div>
              </div>
            );
          })}
          {carriers.length === 0 && !loading && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: "var(--mist)" }}>
              No carriers yet. Click &quot;+ Add Carrier&quot; to get started.
            </div>
          )}
        </div>
      ) : (
        <div className="fp-table-wrap">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
              <th style={thStyle}>Carrier + MC#</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Trucks</th>
              <th style={thStyle}>Portal</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {carriers.map((c) => {
              const st = (c.computed_status as string) || (c.status as string) || "new";
              return (
                <tr key={c.id as string} style={{ borderBottom: "1px solid var(--surface)", cursor: "pointer" }}
                  onClick={() => setSelectedCarrier(c)}>
                  <td style={tdStyle}>
                    <strong>{c.legal_name as string}</strong>
                    <span className="fp-mono" style={{ fontSize: 11, color: "var(--mist)", marginLeft: 8 }}>
                      {c.mc_number ? `MC ${c.mc_number}` : `DOT ${c.dot_number}`}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: statusColor(st), fontWeight: 600, fontSize: 12, textTransform: "uppercase" as const }}>{st}</span>
                    {c.verification_status === "unverified" && (
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 10, fontWeight: 600, background: "#f59e0b22", color: "#f59e0b", marginLeft: 6 }}>NOT VERIFIED</span>
                    )}
                  </td>
                  <td style={tdStyle}>{String(c.power_units || "—")}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: c.portal_status === "active" ? "var(--green)" : "var(--mist)" }}>
                      {(c.portal_status as string) || "not invited"}
                    </span>
                  </td>
                   <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {c.portal_status !== "active" && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openQuickInvite(c); }}
                          style={{ ...btnSmall, color: "var(--amber)", borderColor: "var(--amber)" }}
                        >
                          {inviteActionLabel(c)}
                        </button>
                      )}
                      <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedCarrier(c); }} style={btnSmall}>
                        Details
                      </button>
                    </div>
                   </td>
                 </tr>
               );
             })}
          </tbody>
        </table>
        </div>
      )}

      {/* Carrier Detail Modal */}
      {selectedCarrier && (
        <CarrierDetailModal
          carrier={selectedCarrier}
          onClose={() => { setSelectedCarrier(null); clearCarrierQuery(); }}
          onSaved={() => { fetchCarriers(); setSelectedCarrier(null); clearCarrierQuery(); }}
        />
      )}

      {/* Add Carrier Modal */}
      {showAddModal && (
        <div style={overlayStyle}>
          <div className={modalClass} style={modalStyle}>
            <button type="button" onClick={() => setShowAddModal(false)}
              style={{ float: "right", background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex", alignItems: "center" }}><X size={18} /></button>
            <AddCarrierModal onComplete={() => { setShowAddModal(false); fetchCarriers(); }} />
          </div>
        </div>
      )}

      {quickInviteCarrier && (
        <div style={overlayStyle}>
          <div className={modalClass} style={{ ...modalStyle, width: 420 }}>
            <button
              type="button"
              onClick={closeQuickInvite}
              style={{ float: "right", background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <X size={18} />
            </button>
            <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{inviteActionLabel(quickInviteCarrier)}</h2>
            <p style={{ fontSize: 13, color: "var(--mist)", margin: "0 0 12px" }}>
              Invite <strong style={{ color: "var(--white)" }}>{quickInviteCarrier.legal_name as string}</strong> to the carrier portal.
            </p>
            <label style={{ display: "block", fontSize: 12, color: "var(--mist)", marginBottom: 4 }}>
              Invite email
            </label>
            <input
              placeholder="carrier@email.com"
              value={quickInviteEmail}
              onChange={(e) => setQuickInviteEmail(e.target.value)}
              style={inputStyle}
            />
            {quickInviteMsg && (
              <p style={{ fontSize: 12, color: quickInviteMsg.toLowerCase().includes("error") ? "var(--red)" : "var(--green)", margin: "8px 0 0" }}>
                {quickInviteMsg}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={closeQuickInvite} style={btnOutline}>Cancel</button>
              <button
                type="button"
                onClick={handleQuickInvite}
                disabled={!quickInviteEmail.trim() || quickInviteLoading}
                style={{ ...btnPrimary, opacity: quickInviteEmail.trim() && !quickInviteLoading ? 1 : 0.6 }}
              >
                {quickInviteLoading ? "Sending…" : inviteActionLabel(quickInviteCarrier)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--border)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
      <p className="fp-mono" style={{ fontSize: 10, color: "var(--mist)", margin: 0 }}>{label}</p>
      <p className="fp-mono" style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{value}</p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--white)", fontSize: 14, width: "100%",
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--amber)",
  color: "#000", fontSize: 14, cursor: "pointer", fontWeight: 600,
};
const btnSmall: React.CSSProperties = {
  padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)",
  background: "transparent", color: "var(--blue)", fontSize: 11, cursor: "pointer",
};
const btnOutline: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)",
  background: "transparent", color: "var(--mist)", fontSize: 13, cursor: "pointer",
};
const cardStyle: React.CSSProperties = {
  padding: 16, borderRadius: 10, borderStyle: "solid", borderColor: "var(--border)",
  background: "var(--surface)", cursor: "pointer", transition: "border-color 0.15s",
};
const thStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 12, color: "var(--mist)" };
const tdStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13 };
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
  justifyContent: "center", alignItems: "center", zIndex: 100,
};
const modalStyle: React.CSSProperties = {
  background: "var(--surface)", borderRadius: 12, padding: 24, width: 480,
  maxHeight: "80vh", overflowY: "auto", border: "1px solid var(--border)",
};
const modalClass = "fp-modal";
