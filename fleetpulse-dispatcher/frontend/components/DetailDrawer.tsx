"use client";

import { useEffect, useState } from "react";
import { getCarrier, updateCarrier } from "../services/api";

type Props = {
  carrierName: string;
  carrier?: Record<string, unknown>;
  onLogLoad?: () => void;
  onCarrierUpdated?: () => void;
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  active: "fp-badge fp-badge--active",
  idle:   "fp-badge fp-badge--idle",
  issues: "fp-badge fp-badge--issues",
  new:    "fp-badge fp-badge--new",
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
      status:        String(d.status || "new"),
      contact_name:  String(d.contact_name || ""),
      contact_email: String(d.contact_email || ""),
      contact_phone: String(d.contact_phone || ""),
      owner_name:    String(d.owner_name || ""),
      phone:         String(d.phone || ""),
      whatsapp:      String(d.whatsapp || ""),
      address:       String(d.address || ""),
      dba_name:      String(d.dba_name || ""),
      drivers:       String(d.drivers || ""),
      power_units:   String(d.power_units || ""),
      notes:         String(d.notes || ""),
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
    const res = await getCarrier(carrier.id as string);
    if (res.data) setDetail(res.data as Record<string, unknown>);
    setEditing(false);
    setSaving(false);
    onCarrierUpdated?.();
  };

  const handleCancel = () => setEditing(false);
  const updateField = (key: string, val: string) => setForm((prev) => ({ ...prev, [key]: val }));

  if (editing) {
    return (
      <aside>
        <h3 style={{ fontSize: 18, marginBottom: 12 }}>{carrierName}</h3>
        <p className="fp-label" style={{ marginBottom: 16 }}>Edit Carrier Information</p>

        <fieldset className="fp-fieldset">
          <legend>Status</legend>
          <select value={form.status} onChange={(e) => updateField("status", e.target.value)} className="fp-select">
            <option value="new">New</option>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
            <option value="issues">Issues</option>
          </select>
        </fieldset>

        <fieldset className="fp-fieldset">
          <legend>Company Details</legend>
          <EditField label="DBA Name"    value={form.dba_name}    onChange={(v) => updateField("dba_name", v)} />
          <EditField label="Owner Name"  value={form.owner_name}  onChange={(v) => updateField("owner_name", v)} />
          <EditField label="Address"     value={form.address}     onChange={(v) => updateField("address", v)} />
          <EditField label="Power Units" value={form.power_units} onChange={(v) => updateField("power_units", v)} type="number" />
          <EditField label="Drivers"     value={form.drivers}     onChange={(v) => updateField("drivers", v)} type="number" />
        </fieldset>

        <fieldset className="fp-fieldset">
          <legend>Contact Information</legend>
          <EditField label="Contact Name"  value={form.contact_name}  onChange={(v) => updateField("contact_name", v)} />
          <EditField label="Contact Email" value={form.contact_email} onChange={(v) => updateField("contact_email", v)} type="email" />
          <EditField label="Contact Phone" value={form.contact_phone} onChange={(v) => updateField("contact_phone", v)} type="tel" />
          <EditField label="Company Phone" value={form.phone}         onChange={(v) => updateField("phone", v)} type="tel" />
          <EditField label="WhatsApp #"    value={form.whatsapp}      onChange={(v) => updateField("whatsapp", v)} type="tel" />
        </fieldset>

        <fieldset className="fp-fieldset">
          <legend>Notes</legend>
          <textarea
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            rows={3}
            className="fp-input"
            style={{ resize: "vertical" }}
          />
        </fieldset>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={handleSave} disabled={saving} className="fp-btn fp-btn--success" style={{ flex: 1 }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button type="button" onClick={handleCancel} className="fp-btn fp-btn--ghost">Cancel</button>
        </div>
      </aside>
    );
  }

  return (
    <aside>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <h3 style={{ fontSize: 18, margin: 0 }}>{carrierName}</h3>
        <button type="button" onClick={startEdit} className="fp-btn fp-btn--sm fp-btn--outline">Edit</button>
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 6, alignItems: "center" }}>
        <StatusBadge status={(d.computed_status as string) || (d.status as string) || "new"} />
        {d.verification_status === "unverified" && (
          <span className="fp-badge fp-badge--unverified">Not Verified</span>
        )}
      </div>

      <h4 className="fp-section-header">FMCSA Details</h4>
      <div className="fp-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <KV label="DOT #"            value={d.dot_number as string} />
        <KV label="MC #"             value={d.mc_number as string} />
        <KV label="Authority"        value={d.authority_status as string} />
        <KV label="Operating Status" value={d.operating_status as string} />
        <KV label="Safety Rating"    value={(d.fmcsa_safety_rating as string) || (d.safety_rating as string)} />
        <KV label="Power Units"      value={d.power_units as string} />
        <KV label="Drivers"          value={d.drivers as string} />
        {d.dba_name && <KV label="DBA" value={d.dba_name as string} />}
      </div>

      <h4 className="fp-section-header">Owner & Contact</h4>
      <div className="fp-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <KV label="Owner Name"   value={d.owner_name as string} />
        <KV label="Company Phone" value={d.phone as string} />
        <KV label="Email"        value={d.email as string} />
        <KV label="WhatsApp #"   value={d.whatsapp as string} />
      </div>

      {(d.contact_name || d.contact_email || d.contact_phone) && (
        <>
          <h4 className="fp-section-header">Dispatcher Contact</h4>
          <div className="fp-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            <KV label="Name"  value={d.contact_name as string} />
            <KV label="Email" value={d.contact_email as string} />
            <KV label="Phone" value={d.contact_phone as string} />
          </div>
        </>
      )}

      {(d.address || d.mailing_address) && (
        <>
          <h4 className="fp-section-header">Address</h4>
          <div style={{ marginBottom: 16 }}>
            {d.address && <p style={{ fontSize: 13, margin: "2px 0", color: "var(--slate)" }}>{d.address as string}</p>}
            {d.mailing_address && d.mailing_address !== d.address && (
              <p style={{ fontSize: 12, margin: "4px 0 0", color: "var(--mistLt)" }}>Mail: {d.mailing_address as string}</p>
            )}
          </div>
        </>
      )}

      <div style={{ marginBottom: 16, padding: 8, borderRadius: 6, background: "var(--surface2)" }}>
        <p style={{ fontSize: 13, color: "var(--mistLt)", margin: 0 }}>
          Portal: <strong style={{ color: "var(--white)" }}>
            {(d.portal_status as string) || "not_invited"}
          </strong>
        </p>
      </div>

      {d.notes && (
        <div style={{ marginBottom: 16 }}>
          <h4 className="fp-section-header">Notes</h4>
          <p style={{ fontSize: 13, color: "var(--slate)", margin: 0 }}>{d.notes as string}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onLogLoad && (
          <button type="button" onClick={onLogLoad} className="fp-btn fp-btn--primary">Log Load</button>
        )}
      </div>
    </aside>
  );
}

function KV({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="fp-kv">
      <p className="fp-kv-label">{label}</p>
      <p className="fp-kv-value">{value ?? "—"}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE_CLASS[status] ?? "fp-badge fp-badge--new";
  return <span className={cls}>{status}</span>;
}

function EditField({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label className="fp-label">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="fp-input fp-input--sm" />
    </div>
  );
}
