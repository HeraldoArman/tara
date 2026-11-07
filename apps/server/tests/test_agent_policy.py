from datetime import UTC, datetime, timedelta

import pytest

from tara_server.agent.policy import SpeechPolicy
from tara_server.agent.vision import CapturedFrame
from tara_server.errors import DomainError


def test_join_and_reconnect_default_silent():
    policy = SpeechPolicy()
    assert policy.mode == "silent"
    with pytest.raises(DomainError, match="Activate Ask TARa"):
        policy.require_consultation()
    policy.activate()
    policy.require_consultation()
    policy.deactivate()
    assert policy.mode == "silent"


def test_proactive_speech_requires_recorded_event_and_is_deduplicated():
    policy = SpeechPolicy()
    with pytest.raises(DomainError, match="recorded event"):
        policy.alert_status({"id": "orphan"})
    alert = {"id": "alert-1", "eventId": "failed-attempt-event", "status": "pending"}
    assert policy.alert_status(alert) == "requested"
    assert policy.alert_status(alert) == "suppressed"
    assert policy.mode == "silent"


def test_mute_preserves_alert_without_speech():
    policy = SpeechPolicy(muted=True)
    assert policy.alert_status({"id": "alert", "eventId": "event", "status": "pending"}) == "muted"


def test_freshness_rejects_old_and_future_frames():
    CapturedFrame(b"jpeg", datetime.now(UTC)).ensure_fresh()
    for offset in (-6, 2):
        with pytest.raises(DomainError, match="stale"):
            CapturedFrame(b"jpeg", datetime.now(UTC) + timedelta(seconds=offset)).ensure_fresh()
