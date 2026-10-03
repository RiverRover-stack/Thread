export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liveness only: dependency failures are checked separately during deployment.
// Render probes this frequently; do not run inference or expose configuration here.
export async function GET() {
  // CHALLENGE: identify the application in this response using a fixed string.
  // TODO(you): Add service: "thread" next to status in the object below.
  // Hint 1: Response.json converts an object into a JSON HTTP response.
  // Hint 2: Separate object properties with a comma, as in the headers object.
  // Verify: GET /api/health returns both fields, HTTP 200 and Cache-Control: no-store.
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
