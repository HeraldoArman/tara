"""Upload a main-branch checkout and verify exact Railway deployment IDs."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent.parent
SERVICE_ORDER = ("api", "worker", "web")
DEPLOYMENT_TIMEOUT_SECONDS = 15 * 60
POLL_SECONDS = 15
FAILED_STATUSES = {
    "ABORTED",
    "CANCELED",
    "CANCELLED",
    "CRASHED",
    "FAILED",
    "NEEDS_APPROVAL",
    "REMOVED",
    "REMOVING",
    "SKIPPED",
    "SLEEPING",
}
SHA = re.compile(r"(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})\Z")
URL = re.compile(r"https?://[^\s<>]+")
SAFE_REPOSITORY = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")


class DeploymentError(Exception):
    pass


def annotation(message: str) -> None:
    # Workflow annotations have their own newline/percent escaping convention.
    escaped = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::error::{escaped}", flush=True)


def git(*arguments: str) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", *arguments], cwd=ROOT, capture_output=True, timeout=30, check=False
    )


def selected_services(head: str) -> list[str]:
    if os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise DeploymentError(
            "Production deployment is allowed only from the main branch."
        )
    if not SHA.fullmatch(head):
        raise DeploymentError("The workflow did not supply a valid deployment commit.")
    checkout = git("rev-parse", "HEAD")
    if checkout.returncode or checkout.stdout.decode().strip().lower() != head.lower():
        raise DeploymentError(
            "The checkout does not match the workflow's deployment commit."
        )
    event = os.environ.get("GITHUB_EVENT_NAME")
    if event == "workflow_dispatch":
        return list(SERVICE_ORDER)
    if event != "push":
        raise DeploymentError(
            "Only main pushes and main-branch manual runs may deploy production."
        )
    before = os.environ.get("DEPLOY_BEFORE_SHA", "")
    if not SHA.fullmatch(before) or not before.strip("0"):
        return list(SERVICE_ORDER)
    changes = git("diff", "--name-only", "-z", "--no-renames", before, head, "--")
    if changes.returncode:
        # A force push can remove the old object from the fetched history.
        return list(SERVICE_ORDER)
    paths = changes.stdout.decode("utf-8", errors="surrogateescape").split("\0")
    services: set[str] = set()
    for path in paths:
        if path.startswith((".github/workflows/", "scripts/")) or path in {
            ".dockerignore",
            ".gitignore",
        }:
            return list(SERVICE_ORDER)
        if path.startswith("apps/server/"):
            services.update(("api", "worker"))
        if path.startswith(("apps/web/", "packages/")) or path in {
            "package.json",
            "bun.lock",
            "bunfig.toml",
            "nx.json",
        }:
            services.add("web")
    # GitHub can replace an older pending production run with the newest push.
    # Deploy the complete application so that replaced runs cannot omit a service.
    # The workflow's push path filters keep documentation-only pushes out of this queue.
    return list(SERVICE_ORDER) if services else []


def configured_ids() -> tuple[str, str]:
    if not os.environ.get("RAILWAY_TOKEN", "").strip():
        repository = os.environ.get("GITHUB_REPOSITORY", "HeraldoArman/tara")
        if not SAFE_REPOSITORY.fullmatch(repository):
            repository = "HeraldoArman/tara"
        raise DeploymentError(
            "Add the RAILWAY_PRODUCTION_TOKEN Actions secret with a Railway project token "
            "scoped to the production environment: "
            f"https://github.com/{repository}/settings/secrets/actions"
        )
    identifiers = []
    for name in ("RAILWAY_PROJECT_ID", "RAILWAY_PRODUCTION_ENVIRONMENT_ID"):
        try:
            identifiers.append(str(uuid.UUID(os.environ.get(name, ""))))
        except ValueError:
            raise DeploymentError(
                f"Set the {name} GitHub Actions repository variable."
            ) from None
    return identifiers[0], identifiers[1]


def railway(arguments: list[str], *, timeout: float) -> str:
    try:
        result = subprocess.run(
            ["railway", *arguments],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise DeploymentError(
            "The Railway command timed out; inspect the service in Railway."
        ) from None
    except OSError:
        raise DeploymentError("The pinned Railway CLI could not be started.") from None
    if result.returncode:
        # Never echo CLI output: authentication errors can contain credentials or URLs.
        output = (result.stdout + result.stderr).lower()
        if any(
            text in output
            for text in (
                "not authorized",
                "unauthorized",
                "invalid token",
                "not signed in",
            )
        ):
            raise DeploymentError(
                "Railway rejected the production token. Verify its project and production-environment scope."
            )
        raise DeploymentError(
            f"Railway command failed with exit code {result.returncode}; inspect the service's deployment logs."
        )
    # Keep warnings on stderr out of JSON responses; upload URLs may be on either stream.
    return result.stdout if "--json" in arguments else result.stdout + result.stderr


def deployment_id(output: str) -> str:
    for match in URL.finditer(output):
        parsed = urlsplit(match.group().rstrip(".,)"))
        if parsed.hostname not in {"railway.com", "www.railway.com", "railway.app"}:
            continue
        for value in parse_qs(parsed.query).get("id", []):
            try:
                return str(uuid.UUID(value))
            except ValueError:
                continue
    raise DeploymentError(
        "Railway queued a deployment but did not return an identifiable deployment URL. "
        "Inspect Railway before retrying; no later service was deployed."
    )


def deployment_rows(output: str) -> list[dict]:
    try:
        value = json.loads(output)
    except ValueError:
        raise DeploymentError(
            "Railway returned unreadable deployment metadata."
        ) from None
    if isinstance(value, dict):
        value = value.get("deployments", value.get("items"))
    if not isinstance(value, list):
        raise DeploymentError(
            "Railway returned an unsupported deployment-list response."
        )
    return [item for item in value if isinstance(item, dict)]


def wait_for_success(scope: list[str], identifier: str, service: str) -> None:
    deadline = time.monotonic() + DEPLOYMENT_TIMEOUT_SECONDS
    last_status = ""
    while time.monotonic() < deadline:
        output = railway(
            ["deployment", "list", *scope, "--limit", "100", "--json"],
            timeout=min(60, max(1, deadline - time.monotonic())),
        )
        record = next(
            (row for row in deployment_rows(output) if row.get("id") == identifier),
            None,
        )
        status = str(record.get("status", "UNKNOWN")) if record else "PENDING_METADATA"
        if not re.fullmatch(r"[A-Z_]{1,32}", status):
            status = "UNKNOWN"
        if status != last_status:
            print(f"{service}: {identifier} {status}", flush=True)
            last_status = status
        if status == "SUCCESS":
            return
        if status in FAILED_STATUSES:
            raise DeploymentError(
                f"{service} deployment {identifier} ended in {status}."
            )
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(POLL_SECONDS, remaining))
    raise DeploymentError(
        f"{service} deployment {identifier} did not reach SUCCESS within 15 minutes. "
        "It may still be running; inspect Railway before retrying."
    )


def summary(line: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with Path(path).open("a", encoding="utf-8") as stream:
            stream.write(line + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--prepare",
        action="store_true",
        help="Select services and validate configuration only.",
    )
    arguments = parser.parse_args()
    head = os.environ.get("DEPLOY_HEAD_SHA", os.environ.get("GITHUB_SHA", ""))
    services = selected_services(head)
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with Path(output_path).open("a", encoding="utf-8") as stream:
            stream.write(f"has_changes={'true' if services else 'false'}\n")
    if not services:
        print("No deployable source changes; production is unchanged.", flush=True)
        if arguments.prepare:
            summary(f"Commit `{head}` has no deployable source changes.")
        return 0
    project_id, environment_id = configured_ids()
    print(
        f"Production commit {head}; selected services: {', '.join(services)}",
        flush=True,
    )
    if arguments.prepare:
        return 0
    summary(
        f"Production deployment of `{head}`\n\n| Service | Deployment | Result |\n| --- | --- | --- |"
    )
    for service in services:
        scope = [
            "--project",
            project_id,
            "--environment",
            environment_id,
            "--service",
            service,
        ]
        queued = railway(
            [
                "up",
                *scope,
                "--detach",
                "--yes",
                "--message",
                f"GitHub main {head} ({service})",
            ],
            timeout=180,
        )
        identifier = deployment_id(queued)
        print(
            f"{service}: deployment {identifier} queued; waiting for SUCCESS.",
            flush=True,
        )
        # API pre-deploy migrations and readiness complete before worker or web upload.
        wait_for_success(scope, identifier, service)
        summary(f"| {service} | `{identifier}` | SUCCESS |")
    print("Every selected production service reached SUCCESS.", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DeploymentError as error:
        annotation(str(error))
        summary(f"\nDeployment stopped: {error}")
        raise SystemExit(1) from None
    except (OSError, subprocess.TimeoutExpired):
        annotation(
            "Deployment preparation failed. Check the checkout and workflow configuration."
        )
        raise SystemExit(1) from None
