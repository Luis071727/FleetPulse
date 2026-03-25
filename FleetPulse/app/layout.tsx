import type { Metadata } from "next";

import "@/app/globals.css";
import NavBar from "@/components/NavBar";
import { createServerSupabaseClient, hasSupabaseEnv } from "@/lib/supabase-server";

export const metadata: Metadata = {
  title: "FleetPulse Carrier Portal",
  description: "Carrier self-service portal for loads, docs, and dispatcher communication.",
  themeColor: "#080c10",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let userEmail: string | null = null;

  if (hasSupabaseEnv()) {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  }

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="min-h-screen bg-brand-canvas">
          <NavBar userEmail={userEmail} />
          <main className="mx-auto min-h-[calc(100vh-104px)] max-w-5xl px-4 py-6 sm:px-6">{children}</main>
        </div>
      </body>
    </html>
  );
}

