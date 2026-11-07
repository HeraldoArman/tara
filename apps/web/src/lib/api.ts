export class ApiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly requestId?: string;
  readonly status: number;
  constructor(
    message: string,
    options: ErrorOptions & {
      code?: string;
      status?: number;
      details?: Record<string, unknown>;
      requestId?: string;
    } = {}
  ) {
    super(message, options);
    this.name = "ApiError";
    this.code = options.code ?? "REQUEST_FAILED";
    this.details = options.details ?? {};
    this.requestId = options.requestId;
    this.status = options.status ?? 500;
  }
}
export function apiErrorFromResponse(data: unknown, status: number): ApiError {
  const envelope =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const error =
    envelope.error && typeof envelope.error === "object"
      ? (envelope.error as Record<string, unknown>)
      : {};
  return new ApiError(
    typeof error.message === "string"
      ? error.message
      : "The request could not be completed.",
    {
      code: typeof error.code === "string" ? error.code : undefined,
      details:
        error.details &&
        typeof error.details === "object" &&
        !Array.isArray(error.details)
          ? (error.details as Record<string, unknown>)
          : {},
      requestId:
        typeof error.requestId === "string" ? error.requestId : undefined,
      status,
    }
  );
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
    throw apiErrorFromResponse(data, response.status);
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
