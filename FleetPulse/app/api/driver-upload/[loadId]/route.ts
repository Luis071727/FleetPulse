import { NextRequest, NextResponse } from "next/server";

import { createServiceSupabaseClient } from "@/lib/supabase-server";

export async function POST(
  req: NextRequest,
  { params }: { params: { loadId: string } },
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured for driver uploads." }, { status: 503 });
  }

  const { loadId } = params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const docType = (formData.get("docType") as string) || "OTHER";
  const carrierId = formData.get("cid") as string | null;

  if (!file || !carrierId) {
    return NextResponse.json({ error: "Missing file or carrier ID." }, { status: 400 });
  }

  const sb = createServiceSupabaseClient();

  // Verify load exists and belongs to the carrier
  const loadResult = await sb.from("loads").select("id, carrier_id").eq("id", loadId).maybeSingle();
  const load = loadResult.data;
  if (!load || load.carrier_id !== carrierId) {
    return NextResponse.json({ error: "Load not found or access denied." }, { status: 403 });
  }

  // Upload file to storage
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `${carrierId}/${loadId}/driver/${docType}_${Date.now()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();
  const uploadResult = await sb.storage
    .from("load-documents")
    .upload(storagePath, new Uint8Array(arrayBuffer), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadResult.error) {
    return NextResponse.json({ error: uploadResult.error.message }, { status: 500 });
  }

  // Insert document record
  const insertResult = await sb.from("documents").insert({
    carrier_id: carrierId,
    load_id: loadId,
    document_request_id: null,
    file_name: file.name,
    file_size_bytes: file.size,
    file_type: file.type,
    storage_path: storagePath,
    notes: `Uploaded by driver via link (doc_type: ${docType})`,
  } as never);

  if (insertResult.error) {
    return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
