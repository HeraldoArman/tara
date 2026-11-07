export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(
    message: string,
    options: ErrorOptions & { code?: string; status?: number } = {}
  ) {
    super(message, options);
    this.name = "ApiError";
    this.code = options.code ?? "REQUEST_FAILED";
    this.status = options.status ?? 500;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      cache: "no-store",
      credentials: "same-origin",
      headers,
    });
  } catch (cause) {
    throw new ApiError(
      "The server is unreachable. Check your connection and try again.",
      { cause, code: "NETWORK_ERROR", status: 503 }
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      data.error?.message ?? "The request could not be completed.",
      { code: data.error?.code, status: response.status }
    );
  }
  return data as T;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
export function humanize(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}
export function dateTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
export function duration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}
