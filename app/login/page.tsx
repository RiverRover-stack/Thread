import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { accessFailure } from "@/lib/demo-access";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!accessFailure(await headers())) redirect("/");
  const { error } = await searchParams;
  const message = error === "invalid" ? "That password wasn’t accepted. Try again."
    : error === "unavailable" ? "Sign-in is not configured. Contact the demo owner." : null;
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
    <p className="mb-8 text-lg font-semibold tracking-tight">Thread</p>
    <section className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
      <h1 className="text-3xl font-semibold tracking-tight">Welcome to Thread</h1>
      <p className="mt-3 leading-relaxed text-stone-600">Enter the shared password to capture and revisit thoughts.</p>
      <p className="mt-2 text-sm text-stone-500">Everyone with access shares this timeline.</p>
      <form action="/api/auth/login" method="post" className="mt-6">
        <label htmlFor="password" className="block font-medium">Password</label>
        <input id="password" name="password" type="password" required maxLength={256} autoComplete="current-password"
          aria-describedby={message ? "login-error" : undefined}
          className="mt-2 min-h-12 w-full rounded-lg border border-stone-300 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800" />
        {message && <p id="login-error" role="alert" className="mt-3 text-sm text-red-800">{message}</p>}
        <button type="submit" className="mt-5 min-h-12 w-full rounded-lg bg-emerald-900 px-4 py-3 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">Sign in</button>
      </form>
      <p className="mt-4 text-sm text-stone-500">Your session lasts eight hours. Sign out when you’re finished.</p>
    </section>
  </main>;
}
