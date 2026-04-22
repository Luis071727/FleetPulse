# Active Work — Last updated: 2026-04-22

## In Progress
_none_

## Blocked
_none_

## Recently Completed
- `carrier-compliance-lifecycle` — 2026-04-22 — Unified document compliance + pending-actions lifecycle. Backend: `evaluate_document_status()` + `sync_pending_actions()` + `renew_document()` in `carrier_compliance/service.py`; sync hooked into every mutation (upload_file, upload_file_direct, update_document, delete_document, renew_document). New routes: `POST /carrier-compliance/carriers/{id}/renew` (authenticated; dispatcher or owning carrier), `GET /carriers/{id}/pending-actions`, `GET /carrier/pending-actions`. Migration `20260422_compliance_lifecycle.sql` adds `superseded_at`+`is_active` to compliance_documents and creates `compliance_pending_actions` derived-state table. Carrier portal: new `RenewDocumentModal` (required issue_date + expires_at + file); `ComplianceDocRow` replaces raw upload with a single Renew button; compliance + dashboard queries filter `is_active` so superseded docs disappear immediately.
- `carrier-portal-invoice-feature` — 2026-04-20 — Self-managed carriers now get the dispatcher's rich Send Invoice flow (auto-generated branded PDF, editable email draft, Gmail compose, document attachments list) via new `InvoiceSendModal`, plus AI-drafted follow-up emails via new `FollowUpModal`. Backend `POST /ai/invoice/followup` relaxed from `require_dispatcher` to `require_authenticated` with carrier_id filter; tolerates carrier-created invoices (organization_id=NULL)
- `fix-carrier-portal-json` — 2026-04-20 — Added .limit(1) before .maybeSingle() on all carrier-by-user_id and invoice-by-load_id+carrier_id queries in carrier portal pages (dashboard, loads, load detail, invoices, compliance) to prevent PostgREST "JSON object requested, multiple (or no) rows returned" error when multiple rows match
- `carrier-portal-crud` — 2026-04-10 — Full carrier portal CRUD with portal_mode differentiation: DB migration (portal_mode column), TypeScript types update, backend loads+invoices auth relaxed to require_authenticated, carrier portal loads page (Log Load form), load detail (status advance/edit/delete), invoices page (New Invoice/Mark Paid/Send/Delete), dispatcher CarrierDetailModal Portal Mode toggle
- `carrier-portal-pending-actions` — 2026-04-10 — Dashboard pending actions redesign: paperwork (copy magic link), compliance expired/expiring (30d window), invoices ready to send (delivered loads); UploadButton two-option (Take Photo / Choose File); ComplianceDocRow issue+expiry date inputs + last-updated display; document upload_at timestamps + Driver/You source badges in load detail
- `invoice-paperwork-magic-link` — 2026-03-29 — Full feature: DB migration, backend paperwork module, public upload page, PaperworkRequestModal, InvoiceDetailModal (tabbed)
- `add-claude-documentation` — 2026-03-29 — Created CLAUDE.md, .claude/map.md, .claude/progress.md, and workflow system
