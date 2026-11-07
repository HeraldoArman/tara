import { ENV } from "@/env";

export async function GET(): Promise<Response> {
  try {
    const result = await fetch(new URL("/health/ready", ENV.API_INTERNAL_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return Response.json(
      { status: result.ok ? "ready" : "unavailable" },
      {
        headers: { "Cache-Control": "no-store" },
        status: result.ok ? 200 : 503,
      }
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { headers: { "Cache-Control": "no-store" }, status: 503 }
    );
  }
}
