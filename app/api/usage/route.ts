import { requestAccessFailure } from "@/lib/demo-access";
import { publicDemo, requestWorkspace } from "@/lib/workspace";
import { recordingUsage, usageFailure } from "@/lib/usage";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = requestAccessFailure(request);
  if (denied) return denied;
  if (!publicDemo()) return Response.json({ publicDemo: false }, { headers: { "Cache-Control": "no-store" } });
  try {
    return Response.json({ publicDemo: true, ...await recordingUsage(requestWorkspace(request.headers)!) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return usageFailure(error) || Response.json({ error: "Demo usage is unavailable." }, { status: 503 }); }
}
