"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@/lib/types";

export function createBrowserSupabaseClient() {
  return createClientComponentClient<Database>();
}

