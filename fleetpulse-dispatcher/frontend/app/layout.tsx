import type { Metadata } from "next";
import "../styles/globals.css";
import FeedbackWidget from "../components/FeedbackWidget";

export const metadata: Metadata = {
  title: "FleetPulse Dispatcher",
  description: "Dispatcher Command Center",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
        <FeedbackWidget />
      </body>
    </html>
  );
}
