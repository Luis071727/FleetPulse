import { redirect } from "next/navigation";

import { createServerSupabaseClient, hasSupabaseEnv } from "@/lib/supabase-server";

export default async function HomePage() {
  if (!hasSupabaseEnv()) {
    redirect("/auth/login");
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  redirect(session ? "/dashboard" : "/auth/login");
}

