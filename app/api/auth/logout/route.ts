import { requestAccessFailure, sessionCookie } from "@/lib/demo-access";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const failure = requestAccessFailure(request);
  if (failure) return failure;
  return new Response(null, { status: 303, headers: {
    Location: "/login", "Cache-Control": "no-store", "Set-Cookie": sessionCookie("", true),
  } });
}
