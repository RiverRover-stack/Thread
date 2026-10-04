import type { Metadata } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { accessFailure } from "@/lib/demo-access";

export const metadata: Metadata = {
  title: "Thread",
  description: "Don't interrupt a thought to save it.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const signedIn = Boolean(process.env.THREAD_ACCESS_PASSWORD) && !accessFailure(await headers());
  return (
    <html lang="en">
      <body>
        {signedIn && <div className="mx-auto flex max-w-3xl justify-end px-6 pt-4">
          <form action="/api/auth/logout" method="post"><button type="submit" className="min-h-11 rounded px-3 text-sm font-semibold text-emerald-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Sign out</button></form>
        </div>}
        {children}
      </body>
    </html>
  );
}
