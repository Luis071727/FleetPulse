// ── Shared types ──

export type RosterView = "grid" | "list";

const VIEW_KEY = "fleetpulse:roster:view";
const TOKEN_KEY = "fleetpulse:token";
const USER_KEY = "fleetpulse:user";

export function saveRosterViewPreference(view: RosterView): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIEW_KEY, view);
}

export function loadRosterViewPreference(): RosterView {
  if (typeof window === "undefined") return "grid";
  const value = window.localStorage.getItem(VIEW_KEY);
  return value === "list" ? "list" : "grid";
}

// ── Auth helpers ──

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function setUser(user: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── API client ──

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api/v1";

async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit & { params?: Record<string, string | number | undefined> } = {},
): Promise<{ data: T | null; error: string | null; meta: Record<string, unknown> }> {
  const { params, ...fetchOpts } = opts;
  let url = `${BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    }
    const qsStr = qs.toString();
    if (qsStr) url += `?${qsStr}`;
  }

  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(fetchOpts.headers as Record<string, string> || {}),
  };

  const res = await fetch(url, { ...fetchOpts, headers });
  const json = await res.json();

  // Global 401 handler — token is stale or missing, redirect to login
  if (res.status === 401) {
    clearAuth();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/signup")) {
      window.location.href = "/login";
    }
    return { data: null, error: json.detail || "Session expired. Please log in again.", meta: {} };
  }

  if (!res.ok && !json.error) {
    let detail = json.detail;
    if (Array.isArray(detail)) detail = detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ");
    else if (typeof detail === "object" && detail !== null) detail = detail.msg || JSON.stringify(detail);
    return { data: null, error: detail || `HTTP ${res.status}`, meta: {} };
  }
  return { data: json.data ?? null, error: json.error ?? null, meta: json.meta ?? {} };
}

// ── Auth endpoints ──

export async function signup(email: string, password: string, orgName: string) {
  return apiFetch("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: email.split("@")[0], company_name: orgName }),
  });
}

export async function login(email: string, password: string) {
  return apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function inviteCarrier(carrierId: string, email: string) {
  return apiFetch("/auth/invite/carrier", {
    method: "POST",
    body: JSON.stringify({ carrier_id: carrierId, email }),
  });
}

export async function acceptInvite(token: string, password: string) {
  return apiFetch("/auth/accept-invite", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

// ── Carrier endpoints ──

export async function listCarriers(params?: {
  search?: string;
  status?: string;
  sort_by?: string;
  order?: string;
  limit?: number;
  offset?: number;
}) {
  return apiFetch("/carriers", { params: params as Record<string, string | number | undefined> });
}

export async function getCarrier(id: string) {
  return apiFetch(`/carriers/${encodeURIComponent(id)}`);
}

export async function addCarrier(dotNumber: string) {
  return apiFetch("/carriers", {
    method: "POST",
    body: JSON.stringify({ dot_number: dotNumber }),
  });
}

export async function lookupDot(dotNumber: string) {
  return apiFetch("/carriers/lookup", {
    params: { dot: dotNumber },
  });
}

export async function createCarrierManual(data: {
  legal_name: string;
  dot_number?: string;
  mc_number?: string;
  address?: string;
  phone?: string;
  power_units?: number;
  notes?: string;
}) {
  return apiFetch("/carriers/manual", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCarrier(id: string, data: Record<string, unknown>) {
  return apiFetch(`/carriers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ── Load endpoints ──

export async function listLoads(params?: {
  carrier_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return apiFetch("/loads", { params: params as Record<string, string | number | undefined> });
}

export async function getLoad(id: string) {
  return apiFetch(`/loads/${encodeURIComponent(id)}`);
}

export async function createLoad(data: {
  carrier_id: string;
  broker_mc: string;
  broker_name?: string;
  origin: string;
  destination: string;
  miles: number;
  rate: number;
  driver_pay: number;
  fuel_cost: number;
  tolls?: number;
  pickup_date?: string;
  delivery_date?: string;
  rc_reference?: string;
  customer_ap_email?: string;
}) {
  return apiFetch("/loads", { method: "POST", body: JSON.stringify(data) });
}

export async function updateLoad(id: string, data: Record<string, unknown>) {
  return apiFetch(`/loads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteLoad(id: string) {
  return apiFetch(`/loads/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ── Invoice endpoints ──

export async function listInvoices(params?: {
  carrier_id?: string;
  status?: string;
  sort_by?: string;
  order?: string;
  limit?: number;
  offset?: number;
}) {
  return apiFetch("/invoices", { params: params as Record<string, string | number | undefined> });
}

export async function createInvoice(data: {
  carrier_id: string;
  broker_mc?: string;
  amount: number;
  invoice_number?: string;
  issued_date?: string;
  due_date?: string;
  load_id?: string;
  notes?: string;
}) {
  return apiFetch("/invoices", { method: "POST", body: JSON.stringify(data) });
}

export async function getInvoice(id: string) {
  return apiFetch(`/invoices/${encodeURIComponent(id)}`);
}

export async function markInvoicePaid(id: string) {
  return apiFetch(`/invoices/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "paid" }),
  });
}

export async function updateInvoice(id: string, data: Record<string, unknown>) {
  return apiFetch(`/invoices/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteInvoice(id: string) {
  return apiFetch(`/invoices/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function sendInvoice(id: string) {
  return apiFetch(`/invoices/${encodeURIComponent(id)}/send`, {
    method: "POST",
  });
}

// ── AI endpoints ──

export async function analyzeLoad(loadId: string, forceRefresh = false) {
  return apiFetch("/ai/load/analyze", {
    method: "POST",
    body: JSON.stringify({ load_id: loadId, force_refresh: forceRefresh }),
  });
}

export async function scoreBroker(brokerId: string) {
  return apiFetch("/ai/broker/score", {
    method: "POST",
    body: JSON.stringify({ broker_id: brokerId }),
  });
}

export async function draftFollowup(invoiceId: string, overrideTone?: string) {
  return apiFetch("/ai/invoice/followup", {
    method: "POST",
    body: JSON.stringify({ invoice_id: invoiceId, override_tone: overrideTone }),
  });
}

// ── Broker endpoints ──

export async function listBrokers(params?: { limit?: number; offset?: number }) {
  return apiFetch("/brokers", { params: params as Record<string, string | number | undefined> });
}

// ── Feedback ──

export async function submitFeedback(data: {
  category: string;
  description: string;
  page?: string;
  severity?: string;
}) {
  return apiFetch("/feedback", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Document Requests ──

export async function listDocumentRequests(loadId: string) {
  return apiFetch(`/loads/${encodeURIComponent(loadId)}/document-requests`);
}

export async function createDocumentRequest(loadId: string, data: { doc_type: string; notes?: string }) {
  return apiFetch(`/loads/${encodeURIComponent(loadId)}/document-requests`, {
    method: "POST", body: JSON.stringify(data),
  });
}

export async function updateDocumentRequest(loadId: string, requestId: string, data: { status: string }) {
  return apiFetch(`/loads/${encodeURIComponent(loadId)}/document-requests/${encodeURIComponent(requestId)}`, {
    method: "PATCH", body: JSON.stringify(data),
  });
}

export async function deleteDocumentRequest(loadId: string, requestId: string) {
  return apiFetch(`/loads/${encodeURIComponent(loadId)}/document-requests/${encodeURIComponent(requestId)}`, {
    method: "DELETE",
  });
}

// ── Messages ──

export async function listMessages(loadId: string) {
  return apiFetch(`/loads/${encodeURIComponent(loadId)}/messages`);
}

export async function sendMessage(loadId: string, body: string) {
  return apiFetch(`/loads/${encodeURIComponent(loadId)}/messages`, {
    method: "POST", body: JSON.stringify({ body }),
  });
}

// ── Compliance Documents ──

export async function listComplianceDocs(carrierId: string) {
  return apiFetch(`/carriers/${encodeURIComponent(carrierId)}/compliance-documents`);
}

// ── Pending Actions ──

export async function listPendingActions(carrierId: string) {
  return apiFetch(`/carriers/${encodeURIComponent(carrierId)}/pending-actions`);
}
