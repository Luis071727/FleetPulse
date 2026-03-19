"use client";

import { useEffect, useState } from "react";
import { listLoads, listInvoices, getUser } from "../../../services/api";

export default function PortalOverviewPage() {
  const [loads, setLoads] = useState<Record<string, unknown>[]>([]);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = getUser();
        const carrierId = user?.carrier_id as string | undefined;
        const [loadRes, invRes] = await Promise.all([
          listLoads({ carrier_id: carrierId, limit: 10 }),
          listInvoices({ carrier_id: carrierId, limit: 10 }),
        ]);
        setLoads((loadRes.data as Record<string, unknown>[]) || []);
        setInvoices((invRes.data as Record<string, unknown>[]) || []);
      } catch {
        /* network error */
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const openLoads = loads.filter((l) => l.status !== "completed").length;
  const pendingInvoices = invoices.filter((i) => i.status !== "paid").length;
  const totalOutstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + Number(i.amount || 0), 0);

  return (
    <section>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Carrier Portal Overview</h1>

      {loading ? (
        <p style={{ color: "#94a3b8" }}>Loading...</p>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            <SummaryCard title="Open Loads" value={openLoads} />
            <SummaryCard title="Pending Invoices" value={pendingInvoices} />
            <SummaryCard title="Outstanding" value={`$${totalOutstanding.toLocaleString()}`} />
          </div>

          {/* Recent loads */}
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Recent Loads</h2>
          {loads.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: 14 }}>No loads found.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", textAlign: "left" }}>
                  <th style={thStyle}>Route</th>
                  <th style={thStyle}>Rate</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loads.map((l) => (
                  <tr key={l.id as string} style={{ borderBottom: "1px solid #1e293b" }}>
                    <td style={tdStyle}>{l.origin as string} → {l.destination as string}</td>
                    <td style={tdStyle}>${Number(l.rate || 0).toLocaleString()}</td>
                    <td style={tdStyle}>{(l.status as string) || "in_transit"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Recent invoices */}
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Recent Invoices</h2>
          {invoices.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: 14 }}>No invoices found.</p>
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
        </>
      )}
    </section>
  );
}

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <article style={{ border: "1px solid #334155", borderRadius: 8, padding: 16, background: "#0f172a" }}>
      <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{title}</p>
      <p style={{ fontSize: 24, fontWeight: 600, margin: "4px 0 0" }}>{value}</p>
    </article>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "#94a3b8" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
