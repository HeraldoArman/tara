import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ENV } from "@/env";
import { ApiError, apiErrorFromResponse } from "./api";
import type { User } from "./contracts";

const TRAILING_SLASH = /\/$/;

interface ServerApiOptions {
  readonly onUnauthorized?: "redirect" | "throw";
}

export async function serverApi<T>(
  path: string,
  options: ServerApiOptions = {}
): Promise<T> {
  const jar = await cookies();
  const origin = ENV.API_INTERNAL_URL;
  let response: Response;
  try {
    response = await fetch(
      `${origin.replace(TRAILING_SLASH, "")}/api/v1${path}`,
      {
        cache: "no-store",
        headers: { Cookie: jar.toString() },
        signal: AbortSignal.timeout(10_000),
      }
    );
  } catch (cause) {
    throw new ApiError(
      "TARa cannot reach the application server. Start the API or check its connection.",
      { cause, code: "PROVIDER_UNAVAILABLE", status: 503 }
    );
  }
  if (response.status === 401 && options.onUnauthorized !== "throw") {
    redirect("/login");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw apiErrorFromResponse(data, response.status);
  }
  return data as T;
}
export async function currentUser(): Promise<User> {
  return await serverApi<User>("/auth/me");
}

/** Public entry skips the API entirely for guests; protected pages still redirect. */
export async function optionalCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  if (!jar.get("tara_session")?.value) {
    return null;
  }
  try {
    return await serverApi<User>("/auth/me", { onUnauthorized: "throw" });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      return null;
    }
    throw cause;
  }
}
