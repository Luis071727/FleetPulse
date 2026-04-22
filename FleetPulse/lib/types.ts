export type CarrierStatus = "pending" | "active" | "inactive";
export type CarrierPortalMode = "managed" | "self_managed";
export type LoadStatus = "pending" | "logged" | "in_transit" | "delivered" | "cancelled";
export type DocumentRequestStatus = "pending" | "uploaded" | "approved" | "rejected";
export type DocumentRequestType = "BOL" | "POD" | "RATE_CON" | "INVOICE" | "OTHER";
export type ComplianceDocumentType = "INSURANCE" | "CDL" | "REGISTRATION" | "INSPECTION" | "OTHER";
export type ComplianceStatus = "active" | "expired" | "expiring_soon";
export type SenderRole = "dispatcher" | "carrier";
export type InvoiceStatus = "pending" | "sent" | "paid" | "overdue" | "shortpaid" | "claim";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      carriers: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          name: string | null;
          company_name: string | null;
          dot_number: string | null;
          mc_number: string | null;
          phone: string | null;
          invited_by: string | null;
          invited_at: string | null;
          status: CarrierStatus;
          portal_mode: CarrierPortalMode;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          email: string;
          name?: string | null;
          company_name?: string | null;
          dot_number?: string | null;
          mc_number?: string | null;
          phone?: string | null;
          invited_by?: string | null;
          invited_at?: string | null;
          status?: CarrierStatus;
          portal_mode?: CarrierPortalMode;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["carriers"]["Insert"]>;
        Relationships: [];
      };
      loads: {
        Row: {
          id: string;
          load_number: string | null;
          carrier_id: string | null;
          dispatcher_id: string | null;
          origin: string;
          destination: string;
          pickup_date: string | null;
          delivery_date: string | null;
          status: LoadStatus;
          rate: number | null;
          load_rate: number | null;
          net_profit: number | null;
          rpm: number | null;
          net_rpm: number | null;
          broker_name: string | null;
          customer_ap_email: string | null;
          notes: string | null;
          deleted_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          load_number?: string | null;
          carrier_id?: string | null;
          dispatcher_id?: string | null;
          origin: string;
          destination: string;
          pickup_date?: string | null;
          delivery_date?: string | null;
          status?: LoadStatus;
          rate?: number | null;
          load_rate?: number | null;
          net_profit?: number | null;
          rpm?: number | null;
          net_rpm?: number | null;
          broker_name?: string | null;
          customer_ap_email?: string | null;
          notes?: string | null;
          deleted_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["loads"]["Insert"]>;
        Relationships: [];
      };
      document_requests: {
        Row: {
          id: string;
          load_id: string | null;
          doc_type: DocumentRequestType;
          label: string | null;
          status: DocumentRequestStatus;
          required: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          load_id?: string | null;
          doc_type: DocumentRequestType;
          label?: string | null;
          status?: DocumentRequestStatus;
          required?: boolean | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["document_requests"]["Insert"]>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          document_request_id: string | null;
          load_id: string | null;
          carrier_id: string | null;
          storage_path: string;
          file_name: string | null;
          file_type: string | null;
          file_size_bytes: number | null;
          uploaded_by: string | null;
          uploaded_at: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          document_request_id?: string | null;
          load_id?: string | null;
          carrier_id?: string | null;
          storage_path: string;
          file_name?: string | null;
          file_type?: string | null;
          file_size_bytes?: number | null;
          uploaded_by?: string | null;
          uploaded_at?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
      compliance_documents: {
        Row: {
          id: string;
          carrier_id: string | null;
          doc_type: ComplianceDocumentType;
          label: string | null;
          storage_path: string | null;
          file_name: string | null;
          issued_at: string | null;
          expires_at: string | null;
          status: ComplianceStatus;
          uploaded_at: string | null;
          is_active: boolean | null;
          superseded_at: string | null;
        };
        Insert: {
          id?: string;
          carrier_id?: string | null;
          doc_type: ComplianceDocumentType;
          label?: string | null;
          storage_path?: string | null;
          file_name?: string | null;
          issued_at?: string | null;
          expires_at?: string | null;
          status?: ComplianceStatus;
          uploaded_at?: string | null;
          is_active?: boolean | null;
          superseded_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["compliance_documents"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          load_id: string | null;
          sender_id: string | null;
          sender_role: SenderRole | null;
          body: string;
          read_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          load_id?: string | null;
          sender_id?: string | null;
          sender_role?: SenderRole | null;
          body: string;
          read_at?: string | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      carrier_invitations: {
        Row: {
          id: string;
          email: string;
          dispatcher_id: string | null;
          token: string;
          accepted_at: string | null;
          expires_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          dispatcher_id?: string | null;
          token?: string;
          accepted_at?: string | null;
          expires_at?: string | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["carrier_invitations"]["Insert"]>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          organization_id: string | null;
          load_id: string | null;
          carrier_id: string | null;
          broker_id: string | null;
          amount: number | null;
          status: InvoiceStatus;
          invoice_number: string | null;
          issued_date: string | null;
          due_date: string | null;
          customer_ap_email: string | null;
          followups_sent: number | null;
          deleted_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          load_id?: string | null;
          carrier_id?: string | null;
          broker_id?: string | null;
          amount?: number | null;
          status?: InvoiceStatus;
          invoice_number?: string | null;
          issued_date?: string | null;
          due_date?: string | null;
          customer_ap_email?: string | null;
          followups_sent?: number | null;
          deleted_at?: string | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      link_current_user_to_carrier: {
        Args: Record<string, never>;
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
  };
}

export type CarrierRow = Database["public"]["Tables"]["carriers"]["Row"];
export type LoadRow = Database["public"]["Tables"]["loads"]["Row"];
export type DocumentRequestRow = Database["public"]["Tables"]["document_requests"]["Row"];
export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type ComplianceDocumentRow = Database["public"]["Tables"]["compliance_documents"]["Row"];
export type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
export type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];

