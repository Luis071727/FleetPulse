"use client";

import { useEffect, useState } from "react";
import { createInvoice, listCarriers } from "../services/api";

type Carrier = { id: string; legal_name: string };

type Props = {
  onComplete?: () => void;
};

export default function AddInvoiceModal({ onComplete }: Props) {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [carrierSearch, setCarrierSearch] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [brokerMc, setBrokerMc] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCarriers({ limit: 200 }).then((res) => {
      setCarriers((res.data as Carrier[]) || []);
    }).catch(() => {});
  }, []);

  const filteredCarriers = carrierSearch
    ? carriers.filter((c) => c.legal_name?.toLowerCase().includes(carrierSearch.toLowerCase()))
    : carriers;

  const canSubmit = carrierId && amount && Number(amount) > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await createInvoice({
        carrier_id: carrierId,
        broker_mc: brokerMc || undefined,
        amount: Number(amount),
        invoice_number: invoiceNumber.trim() || undefined,
        issued_date: issuedDate || undefined,
        due_date: dueDate || undefined,
        notes: notes || undefined,
      });
      if (res.error) {
        setError(res.error);
      } else {
        onComplete?.();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Create Invoice</h2>

      {/* Carrier selector */}
      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="Search carriers…"
          value={carrierSearch}
          onChange={(e) => setCarrierSearch(e.target.value)}
          style={{ ...inputStyle, width: "100%", marginBottom: 6 }}
        />
        <select
          value={carrierId}
          onChange={(e) => setCarrierId(e.target.value)}
          style={{ ...inputStyle, width: "100%" }}
        >
          <option value="">Select a carrier…</option>
          {filteredCarriers.map((c) => (
            <option key={c.id} value={c.id}>{c.legal_name}</option>
          ))}
        </select>
      </div>

      <div className="fp-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <input placeholder="Broker MC# (optional)" value={brokerMc} onChange={(e) => setBrokerMc(e.target.value)} style={inputStyle} />
        <input placeholder="Invoice # (optional)" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} style={inputStyle} />
        <input type="number" placeholder="Amount ($)" value={amount} onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")} style={inputStyle} />
        <div>
          <label style={labelStyle}>Issue Date</label>
          <input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </div>
        <div>
          <label style={labelStyle}>Due Date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </div>
      </div>

      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        style={{ ...inputStyle, width: "100%", marginBottom: 12, resize: "vertical" }}
      />

      {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>{error}</p>}

      <button type="button" onClick={handleSubmit} disabled={!canSubmit || loading} style={{ ...btnPrimary, opacity: canSubmit && !loading ? 1 : 0.5 }}>
        {loading ? "Creating…" : "Create Invoice"}
      </button>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 6, border: "1px solid #334155",
  background: "#0f172a", color: "#f8fafc", fontSize: 14,
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: "#64748b", display: "block", marginBottom: 2,
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--amber)",
  color: "#000", fontSize: 14, cursor: "pointer", fontWeight: 600,
};
