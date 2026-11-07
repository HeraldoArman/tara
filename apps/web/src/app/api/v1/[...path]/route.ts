import { ENV } from "@/env";

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REQUEST_HEADERS = ["accept", "content-type", "cookie", "origin"];
const RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "retry-after",
  "x-request-id",
];

function failure(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, details: {}, message, requestId: crypto.randomUUID() } },
    { headers: { "Cache-Control": "no-store" }, status }
  );
}

async function readBody(request: Request): Promise<Uint8Array | undefined> {
  if (!request.body || request.method === "GET" || request.method === "HEAD") {
    return;
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: Consume the stream in order while enforcing the memory limit.
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("Upload exceeds limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function proxy(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  if (MUTATIONS.has(request.method)) {
    const origin = request.headers.get("origin");
    if (
      origin !== new URL(ENV.APP_ORIGIN).origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      return failure("FORBIDDEN", "Request origin is not allowed.", 403);
    }
  }
  const { path } = await context.params;
  if (path.some((segment) => segment === "." || segment === "..")) {
    return failure("NOT_FOUND", "API route was not found.", 404);
  }
  const url = new URL(ENV.API_INTERNAL_URL);
  url.pathname = `/api/v1/${path.map(encodeURIComponent).join("/")}`;
  url.search = new URL(request.url).search;
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  try {
    const body = await readBody(request);
    const upstream = await fetch(url, {
      body: body as BodyInit | undefined,
      cache: "no-store",
      headers,
      method: request.method,
      redirect: "manual",
      signal: AbortSignal.timeout(95_000),
    });
    const responseHeaders = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) {
        responseHeaders.set(name, value);
      }
    }
    for (const cookie of upstream.headers.getSetCookie()) {
      responseHeaders.append("set-cookie", cookie);
    }
    return new Response(upstream.body, {
      headers: responseHeaders,
      status: upstream.status,
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return failure(
        "VALIDATION_FAILED",
        "Upload exceeds the 12 MB limit.",
        413
      );
    }
    return failure(
      "PROVIDER_UNAVAILABLE",
      "The TARa API is unavailable. Check the connection and try again.",
      503
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
