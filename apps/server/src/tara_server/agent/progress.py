"""Compare recorded procedure progress with an optional, unverified observation."""

from tara_server.domain.execution import SUCCESS


def step_summary(step: dict) -> dict:
    return {
        "id": step["id"],
        "title": step["title"][:180],
        "status": step["status"],
        "required": step.get("required", True),
    }


def build_progress(snapshot: dict, observed_step_id: str | None = None) -> dict:
    """Read server records in their saved order; never infer completion or change a run."""
    steps = [step_summary(step) for step in snapshot["steps"]]
    positions = {step["id"]: index for index, step in enumerate(steps)}
    current_id = snapshot.get("currentStepId")
    current_index = positions.get(current_id)
    observed_index = positions.get(observed_step_id)
    current = steps[current_index] if current_index is not None else None
    observed = steps[observed_index] if observed_index is not None else None
    before_observed = steps[:observed_index] if observed_index is not None else []
    unverified_before = [
        step for step in before_observed if step["required"] and step["status"] not in SUCCESS
    ]
    skipped_before = [
        step for step in before_observed if step["required"] and step["status"] == "skipped"
    ]
    position = None
    assessment = (
        "Recorded progress only. Remaining required steps are not recorded as complete; "
        "a single frame cannot establish physical skips."
    )
    if observed_index is not None:
        if current_index is None:
            assessment = (
                "The observed candidate belongs to the selected procedure, but there is no "
                "recorded current step to compare. Earlier unverified required steps are not "
                "recorded as complete; this does not prove they were physically skipped."
            )
        elif observed_index == current_index:
            position = "current"
            assessment = (
                "The observed candidate matches the recorded current step. Earlier unverified "
                "required steps are not recorded as complete; a frame does not verify them."
            )
        elif observed_index > current_index:
            position = "ahead"
            assessment = (
                "The observed candidate is ahead of the recorded current step. Earlier "
                "unverified required steps are not recorded as complete; this does not prove "
                "they were physically skipped."
            )
        else:
            position = "behind"
            assessment = (
                "The observed candidate is behind the recorded current step. This observation "
                "does not change recorded progress or prove that any step was skipped."
            )
    elif observed_step_id is not None:
        assessment = (
            "The observed candidate does not match a step in the selected procedure. Only "
            "recorded progress is available; no earlier gaps or physical skips are inferred."
        )
    sop = snapshot.get("sop", {})
    return {
        "sop": {key: sop[key] for key in ("id", "key", "title", "version") if key in sop},
        "sopVersionId": snapshot.get("workOrder", {}).get("sopVersionId"),
        "runStatus": snapshot.get("status"),
        "currentStepId": current_id,
        "currentStep": current,
        "completedSteps": [
            step for step in steps if step["status"] in SUCCESS and step["status"] != "skipped"
        ],
        "explicitlySkippedSteps": [step for step in steps if step["status"] == "skipped"],
        "heldSteps": [step for step in steps if step["status"] == "held"],
        "unverifiedRequiredSteps": [
            step for step in steps if step["required"] and step["status"] not in SUCCESS
        ],
        "observedStep": observed,
        "observedPosition": position,
        "unverifiedRequiredBeforeObserved": unverified_before,
        "explicitlySkippedRequiredBeforeObserved": skipped_before,
        "assessment": assessment,
        "limitations": [
            "An observed step is a candidate from one frame, not proof of execution or completion.",
            "A single frame cannot establish earlier actions, invisible work or physical skips.",
            "Only status 'skipped' records an explicit skip; unverified means not recorded as complete.",
            "This comparison never verifies a step, advances the run or changes any record.",
        ],
    }
