"""A closed worker stays available only for the bounded recovery window (§6.4)."""

import asyncio
from datetime import timedelta

import pytest

from konvami_api.worker import _finish_recovery
from tests.domain.test_voice_continuation import setup


def test_worker_grace_expires_and_persists_one_logical_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    world, voice, root = setup()
    call = voice.live_call(root)
    assert call is not None
    world.clock.now += timedelta(seconds=20)
    call.closed()
    voice.finished(root, call)
    before = world.clock()

    async def pass_time(seconds: float) -> None:
        world.clock.now += timedelta(seconds=seconds)

    monkeypatch.setattr(asyncio, "sleep", pass_time)
    asyncio.run(_finish_recovery(voice, root))
    assert (world.clock() - before).total_seconds() == 45
    assert voice.allowance(world.sessions.sessions[root].user_id).used_seconds == 20
    assert root in world.sessions.finished


def test_worker_retries_transient_finalization_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    from konvami_api.worker import _finish_call

    world, voice, root = setup()
    call = voice.live_call(root)
    assert call is not None
    world.clock.now += timedelta(seconds=20)
    voice.end_call(world.sessions.sessions[root].user_id, root)
    call.closed()
    release = world.sessions.release_seconds
    attempts = 0

    def transient(*args: object) -> None:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("storage unavailable")
        release(*args)  # type: ignore[arg-type]

    async def pass_time(seconds: float) -> None:
        world.clock.now += timedelta(seconds=seconds)

    monkeypatch.setattr(world.sessions, "release_seconds", transient)
    monkeypatch.setattr(asyncio, "sleep", pass_time)
    asyncio.run(_finish_call(voice, root, call))
    assert attempts == 2
    assert voice.allowance(world.sessions.sessions[root].user_id).used_seconds == 20
