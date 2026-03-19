"use client";

import { useEffect, useState } from "react";
import { listInvoices, getUser } from "../../../../services/api";

type R = Record<string, unknown>;

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getUser();
    const carrierId = user?.carrier_id as string | undefined;
    listInvoices({ carrier_id: carrierId, limit: 50, sort_by: "days_outstanding", order: "desc" })
      .then((res) => setInvoices((res.data as R[]) || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#94a3b8" }}>Loading invoices…</p>;

  const totalOutstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + Number(i.amount || 0), 0);

  return (
    <section>
      <h2 style={{ fontSize: 20, marginBottom: 6 }}>My Invoices</h2>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
        Outstanding: <strong style={{ color: "#f59e0b" }}>${totalOutstanding.toLocaleString()}</strong>
      </p>

      {invoices.length === 0 ? (
        <p style={{ color: "#64748b" }}>No invoices found.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b", textAlign: "left" }}>
              <th style={thStyle}>Invoice #</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Days</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Issued</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => {
              const days = Number(i.days_outstanding || 0);
              const daysColor = days >= 22 ? "#ef4444" : days >= 8 ? "#f59e0b" : "#22c55e";
              return (
                <tr key={i.id as string} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={tdStyle}>{(i.invoice_number as string) || (i.id as string).slice(0, 8)}</td>
                  <td style={tdStyle}>${Number(i.amount || 0).toLocaleString()}</td>
                  <td style={tdStyle}><span style={{ color: daysColor, fontWeight: 600 }}>{days}d</span></td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: (i.status as string) === "paid" ? "#22c55e" : "#f59e0b", textTransform: "uppercase" as const }}>
                      {(i.status as string) || "pending"}
                    </span>
                  </td>
                  <td style={tdStyle}>{(i.issued_date as string) || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 12, color: "#64748b" };
const tdStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13 };
