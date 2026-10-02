import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thread",
  description: "Don't interrupt a thought to save it.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
