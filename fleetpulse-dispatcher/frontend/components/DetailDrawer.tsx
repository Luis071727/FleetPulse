"use client";

import { useEffect, useState } from "react";
import { getCarrier, updateCarrier } from "../services/api";

type Props = {
  carrierName: string;
  carrier?: Record<string, unknown>;
  onLogLoad?: () => void;
  onCarrierUpdated?: () => void;
};

export default function DetailDrawer({ carrierName, carrier, onLogLoad, onCarrierUpdated }: Props) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(carrier || null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (carrier?.id) {
      getCarrier(carrier.id as string).then((res) => {
        if (res.data) setDetail(res.data as Record<string, unknown>);
      });
    }
  }, [carrier]);

  const d = detail || carrier || {};

  const startEdit = () => {
    setForm({
      status: String(d.status || "new"),
      contact_name: String(d.contact_name || ""),
      contact_email: String(d.contact_email || ""),
      contact_phone: String(d.contact_phone || ""),
      owner_name: String(d.owner_name || ""),
      phone: String(d.phone || ""),
      whatsapp: String(d.whatsapp || ""),
      address: String(d.address || ""),
      dba_name: String(d.dba_name || ""),
      drivers: String(d.drivers || ""),
      power_units: String(d.power_units || ""),
      notes: String(d.notes || ""),
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!carrier?.id) return;
    setSaving(true);
    const updates: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(form)) {
      if (key === "drivers" || key === "power_units") {
        const num = parseInt(val, 10);
        if (!isNaN(num)) updates[key] = num;
      } else if (val.trim()) {
        updates[key] = val.trim();
      }
    }
    await updateCarrier(carrier.id as string, updates);
    // Refresh detail
    const res = await getCarrier(carrier.id as string);
    if (res.data) setDetail(res.data as Record<string, unknown>);
    setEditing(false);
    setSaving(false);
    onCarrierUpdated?.();
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const updateField = (key: string, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  if (editing) {
    return (
      <aside>
        <h3 style={{ fontSize: 18, marginBottom: 12 }}>{carrierName}</h3>
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>Edit Carrier Information</p>

        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Status</legend>
          <select value={form.status} onChange={(e) => updateField("status", e.target.value)} style={inputStyle}>
            <option value="new">New</option>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
            <option value="issues">Issues</option>
          </select>
        </fieldset>

        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Company Details</legend>
          <EditField label="DBA Name" value={form.dba_name} onChange={(v) => updateField("dba_name", v)} />
          <EditField label="Owner Name" value={form.owner_name} onChange={(v) => updateField("owner_name", v)} />
          <EditField label="Address" value={form.address} onChange={(v) => updateField("address", v)} />
          <EditField label="Power Units" value={form.power_units} onChange={(v) => updateField("power_units", v)} type="number" />
          <EditField label="Drivers" value={form.drivers} onChange={(v) => updateField("drivers", v)} type="number" />
        </fieldset>

        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Contact Information</legend>
          <EditField label="Contact Name" value={form.contact_name} onChange={(v) => updateField("contact_name", v)} />
          <EditField label="Contact Email" value={form.contact_email} onChange={(v) => updateField("contact_email", v)} type="email" />
          <EditField label="Contact Phone" value={form.contact_phone} onChange={(v) => updateField("contact_phone", v)} type="tel" />
          <EditField label="Company Phone" value={form.phone} onChange={(v) => updateField("phone", v)} type="tel" />
          <EditField label="WhatsApp #" value={form.whatsapp} onChange={(v) => updateField("whatsapp", v)} type="tel" />
        </fieldset>

        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Notes</legend>
          <textarea
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </fieldset>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={handleSave} disabled={saving} style={btnSave}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button type="button" onClick={handleCancel} style={btnCancel}>Cancel</button>
        </div>
      </aside>
    );
  }

  return (
    <aside>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <h3 style={{ fontSize: 18, margin: 0 }}>{carrierName}</h3>
        <button type="button" onClick={startEdit} style={btnEdit}>Edit</button>
      </div>

      {/* Status */}
      <div style={{ marginBottom: 16 }}>
        <StatusBadge status={(d.computed_status as string) || (d.status as string) || "new"} />
        {d.verification_status === "unverified" && (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600, background: "#f59e0b22", color: "#f59e0b", textTransform: "uppercase", marginLeft: 8 }}>
            Not Verified
          </span>
        )}
      </div>

      {/* FMCSA / Fleet Details */}
      <SectionHeader>FMCSA Details</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <KV label="DOT #" value={d.dot_number as string} />
        <KV label="MC #" value={d.mc_number as string} />
        <KV label="Authority" value={d.authority_status as string} />
        <KV label="Operating Status" value={d.operating_status as string} />
        <KV label="Safety Rating" value={(d.fmcsa_safety_rating as string) || (d.safety_rating as string)} />
        <KV label="Power Units" value={d.power_units as string} />
        <KV label="Drivers" value={d.drivers as string} />
        {d.dba_name && <KV label="DBA" value={d.dba_name as string} />}
      </div>

      {/* Owner & Contact Info */}
      <SectionHeader>Owner & Contact</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <KV label="Owner Name" value={d.owner_name as string} />
        <KV label="Company Phone" value={d.phone as string} />
        <KV label="Email" value={d.email as string} />
        <KV label="WhatsApp #" value={d.whatsapp as string} />
      </div>

      {(d.contact_name || d.contact_email || d.contact_phone) && (
        <>
          <SectionHeader>Dispatcher Contact</SectionHeader>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            <KV label="Name" value={d.contact_name as string} />
            <KV label="Email" value={d.contact_email as string} />
            <KV label="Phone" value={d.contact_phone as string} />
          </div>
        </>
      )}

      {/* Address */}
      {(d.address || d.mailing_address) && (
        <>
          <SectionHeader>Address</SectionHeader>
          <div style={{ marginBottom: 16 }}>
            {d.address && <p style={{ fontSize: 13, margin: "2px 0", color: "#cbd5e1" }}>{d.address as string}</p>}
            {d.mailing_address && d.mailing_address !== d.address && (
              <p style={{ fontSize: 12, margin: "4px 0 0", color: "#94a3b8" }}>Mail: {d.mailing_address as string}</p>
            )}
          </div>
        </>
      )}

      {/* Portal status */}
      <div style={{ marginBottom: 16, padding: 8, borderRadius: 6, background: "#1e293b" }}>
        <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
          Portal: <strong style={{ color: "#f8fafc" }}>
            {(d.portal_status as string) || "not_invited"}
          </strong>
        </p>
      </div>

      {/* Notes */}
      {d.notes && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader>Notes</SectionHeader>
          <p style={{ fontSize: 13, color: "#cbd5e1", margin: 0 }}>{d.notes as string}</p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onLogLoad && (
          <button type="button" onClick={onLogLoad} style={btnPrimary}>Log Load</button>
        )}
      </div>
    </aside>
  );
}

function KV({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 14, margin: 0 }}>{value ?? "—"}</p>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4 style={{ fontSize: 12, color: "#64748b", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #1e293b", paddingBottom: 4 }}>
      {children}
    </h4>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "active" ? "#22c55e" : status === "idle" ? "#f59e0b" : status === "issues" ? "#ef4444" : "#64748b";
  return (
    <span style={{
      fontSize: 11, padding: "2px 10px", borderRadius: 10, fontWeight: 600,
      background: `${color}22`, color, textTransform: "uppercase",
    }}>
      {status}
    </span>
  );
}

function EditField({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 2 }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "#3b82f6",
  color: "#fff", fontSize: 14, cursor: "pointer",
};
const btnEdit: React.CSSProperties = {
  padding: "4px 12px", borderRadius: 4, border: "1px solid #334155",
  background: "transparent", color: "#60a5fa", fontSize: 12, cursor: "pointer",
};
const btnSave: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "#22c55e",
  color: "#fff", fontSize: 14, cursor: "pointer", flex: 1,
};
const btnCancel: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "1px solid #334155",
  background: "transparent", color: "#94a3b8", fontSize: 14, cursor: "pointer",
};
const inputStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 6, border: "1px solid #334155",
  background: "#0f172a", color: "#f8fafc", fontSize: 13, width: "100%",
};
const fieldsetStyle: React.CSSProperties = {
  border: "1px solid #1e293b", borderRadius: 8, padding: "12px", marginBottom: 12,
};
const legendStyle: React.CSSProperties = {
  fontSize: 12, color: "#94a3b8", fontWeight: 600, padding: "0 6px",
};
