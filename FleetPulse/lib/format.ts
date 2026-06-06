/**
 * Shared formatting utilities for the Carrier Portal.
 */

export function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  const v = Number(n);
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const DOC_LABELS: Record<string, string> = {
  BOL: "BOL",
  POD: "POD",
  RATE_CON: "Rate Con",
  WEIGHT_TICKET: "Weight Ticket",
  LUMPER_RECEIPT: "Lumper Receipt",
  INVOICE: "Invoice",
  OTHER: "Other",
};
