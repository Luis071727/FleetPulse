"use client";

import { useEffect, useState } from "react";
import { listLoads, listInvoices, getUser } from "../../../../services/api";

export default function PortalLoadsPage() {
  const [loads, setLoads] = useState<Record<string, unknown>[]>([]);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = getUser();
        const carrierId = user?.carrier_id as string | undefined;
        const [loadRes, invRes] = await Promise.all([
          listLoads({ carrier_id: carrierId, limit: 50 }),
          listInvoices({ carrier_id: carrierId, limit: 50 }),
        ]);
        setLoads((loadRes.data as Record<string, unknown>[]) || []);
        setInvoices((invRes.data as Record<string, unknown>[]) || []);
      } catch {
        /* network error */
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
    const intervalId = window.setInterval(() => {
      void fetchData();
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  if (loading) return <p style={{ color: "#94a3b8", padding: 16 }}>Loading...</p>;

  return (
    <section>
      <h2 style={{ fontSize: 20, marginBottom: 12 }}>Load History</h2>
      {loads.length === 0 ? (
        <p style={{ color: "#64748b" }}>No loads found.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 32 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155", textAlign: "left" }}>
              <th style={thStyle}>Route</th>
              <th style={thStyle}>Miles</th>
              <th style={thStyle}>Rate</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Date</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.id as string} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={tdStyle}>{l.origin as string} → {l.destination as string}</td>
                <td style={tdStyle}>{l.miles as number}</td>
                <td style={tdStyle}>${Number(l.rate || 0).toLocaleString()}</td>
                <td style={tdStyle}>{(l.status as string) || "in_transit"}</td>
                <td style={tdStyle}>{(l.pickup_date as string) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontSize: 20, marginBottom: 12 }}>Invoice History</h2>
      {invoices.length === 0 ? (
        <p style={{ color: "#64748b" }}>No invoices found.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155", textAlign: "left" }}>
              <th style={thStyle}>Invoice #</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Days</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id as string} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={tdStyle}>{(i.invoice_number as string) || (i.id as string).slice(0, 8)}</td>
                <td style={tdStyle}>${Number(i.amount || 0).toLocaleString()}</td>
                <td style={tdStyle}>{i.days_outstanding as number}d</td>
                <td style={tdStyle}>{(i.status as string) || "pending"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "#94a3b8" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
