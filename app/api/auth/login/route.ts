import { accessConfigurationFailure, createSession, crossSiteFailure, passwordMatches, sessionCookie } from "@/lib/demo-access";

export const runtime = "nodejs";

function redirect(error?: string, cookie?: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: error ? `/login?error=${error}` : "/", "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) },
  });
}

export async function POST(request: Request) {
  const configuration = accessConfigurationFailure();
  if (configuration || !process.env.THREAD_ACCESS_PASSWORD) return redirect("unavailable");
  const crossSite = crossSiteFailure(request, true);
  if (crossSite) return crossSite;
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return redirect("invalid");
  const reader = request.body?.getReader();
  if (!reader) return redirect("invalid");
  let body = "";
  try {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return redirect("invalid"); }
      chunks.push(new Uint8Array(value));
    }
    body = await new Blob(chunks).text();
  } catch { return redirect("invalid"); }
  finally { reader.releaseLock(); }
  const fields = new URLSearchParams(body);
  const passwords = fields.getAll("password");
  if (passwords.length !== 1 || passwords[0].length > 256 || !passwordMatches(passwords[0])) return redirect("invalid");
  return redirect(undefined, sessionCookie(createSession()));
}
