"""Evaluate reviewed JPEG fixtures; never mistake synthetic checks for physical accuracy."""

import argparse
import asyncio
import hashlib
import io
import json
import math
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
from PIL import Image

from tara_server.agent.vision import CapturedFrame, StillImageVerifier
from tara_server.settings import get_settings


def load_samples(manifest: Path) -> list[dict]:
    samples = json.loads(manifest.read_text())
    if not isinstance(samples, list) or not samples:
        raise ValueError("A nonempty reviewed fixture list is required")
    for sample in samples:
        if not sample.get("reviewer") or not sample.get("conditions"):
            raise ValueError("Each fixture needs a human reviewer and camera conditions")
        image_path = manifest.parent / sample["image"]
        data = image_path.read_bytes()
        if hashlib.sha256(data).hexdigest() != sample["sha256"]:
            raise ValueError(f"Image hash does not match: {image_path.name}")
        image = Image.open(io.BytesIO(data))
        if image.format != "JPEG" or image.width > 1280 or image.height > 720:
            raise ValueError("Fixtures must contain bounded JPEGs, at most 1280 by 720")
        image.verify()
        required = {item["id"] for item in sample["step"]["verification"]["criteria"]}
        if set(sample["expected"]) != required or any(
            verdict not in {"pass", "fail", "unclear"} for verdict in sample["expected"].values()
        ):
            raise ValueError("Reviewed verdicts must cover every required criterion exactly")
    return samples


async def evaluate(args):
    samples = load_samples(args.manifest)
    if args.validate_only:
        print(f"Validated {len(samples)} reviewed fixtures; no provider requests made")
        return
    settings = get_settings()
    if not settings.openai_api_key:
        raise SystemExit("Set worker OPENAI_API_KEY to run a real evaluation")
    records = []
    false_accepts = 0
    false_rejects = 0
    agreements = 0
    total = 0
    durations = []
    async with httpx.AsyncClient() as client:
        verifier = StillImageVerifier(client, settings.openai_api_key, settings.vision_model)
        for sample in samples:
            frame = CapturedFrame(
                (args.manifest.parent / sample["image"]).read_bytes(), datetime.now(UTC)
            )
            started = time.monotonic()
            verdict = await verifier.assess(frame, sample["step"])
            elapsed = (time.monotonic() - started) * 1000
            durations.append(elapsed)
            for criterion in verdict.criteria:
                expected = sample["expected"][criterion.id]
                total += 1
                agreements += criterion.verdict == expected
                false_accepts += criterion.verdict == "pass" and expected != "pass"
                false_rejects += criterion.verdict != "pass" and expected == "pass"
            records.append(
                {
                    "image": sample["image"],
                    "sha256": frame.sha256,
                    "reviewer": sample["reviewer"],
                    "conditions": sample["conditions"],
                    "expected": sample["expected"],
                    "elapsedMs": elapsed,
                    "assessment": verdict.model_dump(mode="json", by_alias=True),
                }
            )
    durations.sort()
    summary = {
        "model": settings.vision_model,
        "samples": len(samples),
        "criteria": total,
        "agreement": agreements / total if total else None,
        "falseAccepts": false_accepts,
        "falseRejects": false_rejects,
        "p50Ms": durations[(len(durations) - 1) // 2],
        "p95Ms": durations[max(0, math.ceil(len(durations) * 0.95) - 1)],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"summary": summary, "records": records}, indent=2) + "\n")
    print(json.dumps(summary))
    if false_accepts > args.max_false_accepts:
        raise SystemExit("Evaluation failed the configured false-accept gate")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, default=Path(".data/evaluations/vision.json"))
    parser.add_argument("--max-false-accepts", type=int, default=0)
    parser.add_argument("--validate-only", action="store_true")
    asyncio.run(evaluate(parser.parse_args()))
