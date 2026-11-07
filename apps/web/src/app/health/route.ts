export function GET(): Response {
  return Response.json(
    { service: "tara-web", status: "ok" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
