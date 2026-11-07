"""Bounded metrics and OpenTelemetry spans; never record payloads, tokens or signed URLs."""

import time
from collections.abc import Awaitable, Callable
from functools import wraps

from opentelemetry import trace
from prometheus_client import Counter, Histogram

from tara_server.errors import DomainError

tracer = trace.get_tracer("tara-server")
API_DURATION = Histogram(
    "tara_api_request_duration_seconds", "API request duration", ["method", "route"]
)
API_REQUESTS = Counter("tara_api_requests_total", "API requests", ["method", "route", "status"])
OPERATION_DURATION = Histogram(
    "tara_operation_duration_seconds", "Domain operation duration", ["operation"]
)
OPERATION_FAILURES = Counter(
    "tara_operation_failures_total", "Safe domain operation failures", ["operation", "code"]
)
ATTEMPTS = Counter("tara_attempts_total", "Recorded execution attempts", ["kind", "outcome"])
IDEMPOTENT_REPLAYS = Counter("tara_idempotent_replays_total", "Committed duplicate request replays")
EVIDENCE_BYTES = Histogram(
    "tara_evidence_upload_bytes",
    "Selected evidence/source object size",
    buckets=(1024, 16384, 65536, 262144, 1048576, 10485760),
)
EVIDENCE_DURATION = Histogram(
    "tara_evidence_upload_duration_seconds", "Object storage upload duration", ["status"]
)
ALERTS = Counter("tara_alerts_created_total", "Eligible visible alerts", ["event_type"])
CONSULTATIONS = Counter("tara_consultation_activations_total", "Explicit consultation activations")


def instrument[**P, T](
    name: str,
) -> Callable[[Callable[P, Awaitable[T]]], Callable[P, Awaitable[T]]]:
    def decorate(function: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
        @wraps(function)
        async def wrapped(*args: P.args, **kwargs: P.kwargs) -> T:
            started = time.monotonic()
            with tracer.start_as_current_span(f"tara.{name}") as span:
                if len(args) > 2 and isinstance(args[2], str):
                    span.set_attribute("tara.resource_id", args[2])
                try:
                    return await function(*args, **kwargs)
                except DomainError as error:
                    span.set_attribute("tara.error_code", error.code)
                    OPERATION_FAILURES.labels(operation=name, code=error.code).inc()
                    raise
                finally:
                    OPERATION_DURATION.labels(operation=name).observe(time.monotonic() - started)

        return wrapped

    return decorate
