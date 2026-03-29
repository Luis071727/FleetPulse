export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "'IBM Plex Sans', sans-serif", background: "#0D1318", color: "#F0F6FC", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  );
}
