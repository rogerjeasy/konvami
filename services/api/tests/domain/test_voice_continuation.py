"""A replacement transport must remain the same billed and reported practice call (§6.4)."""

from dataclasses import replace
from datetime import timedelta
from uuid import UUID

import pytest

from konvami_api.domain.continuation import Continuations
from konvami_api.domain.live_call import KeepAudio, Turn
from konvami_api.domain.voice import CallPurpose, VoiceCallService, VoiceError
from tests.continuations import MemoryContinuations
from tests.world import USER, VOICE, World


def setup() -> tuple[World, VoiceCallService, str]:
    world = World()
    partner, _ = world.onboard()
    voice = VoiceCallService(
        settings=VOICE,
        scripts={CallPurpose.PRACTICE: world.practice},
        accounts=world.accounts,
        provider=world.provider,
        sessions=world.sessions,
        starter=world.starter,
        clock=world.clock,
        recordings=world.recordings,
        meter=world.meter,
        guard=world.guard,
        continuations=Continuations(MemoryContinuations(world.sessions)),
        current_language=lambda user: world.profiles.get(user).target_language,
    )
    root = voice.start(USER, CallPurpose.PRACTICE, "offer", partner.id).call_id
    return world, voice, root


def test_continues_saved_context_and_refunds_gap_without_duplicate_reports() -> None:
    world, voice, root = setup()
    started = world.clock()
    call = voice.live_call(root)
    assert call is not None
    call.turns.append(Turn("learner", "Ich möchte ein Ticket."))
    world.clock.now += timedelta(seconds=40)
    call.closed()
    voice.finished(root, call)
    assert root not in world.sessions.finished
    world.clock.now += timedelta(seconds=10)
    continued = voice.continue_call(USER, root, "retry-1", "second-offer")
    assert continued.call_id == root
    assert continued.max_seconds == VOICE.max_seconds[CallPurpose.PRACTICE] - 50
    assert "Ich möchte ein Ticket." in world.provider.created[-1][1]["instructions"]
    assert len(world.sessions.sessions) == 1
    retry = voice.continue_call(USER, root, "retry-1", "second-offer")
    assert retry.sdp_answer == continued.sdp_answer
    assert len(world.provider.created) == 2
    child = world.starter.started[-1][0]
    replacement = voice.live_call(child)
    assert replacement is not None
    replacement.turns.append(Turn("persona", "Wohin möchten Sie fahren?"))
    world.clock.now += timedelta(seconds=20)
    voice.end_call(USER, root)
    replacement.closed()
    voice.finished(child, replacement)
    assert len(world.sessions.finished[root].turns) == 2
    assert world.conversations.get(USER, root).seconds == 60
    assert (
        world.sessions.seconds_used(USER, started.date() - timedelta(days=started.weekday())) == 60
    )
    voice.finished(root, call)
    voice.finished(child, replacement)
    assert (
        world.sessions.seconds_used(USER, started.date() - timedelta(days=started.weekday())) == 60
    )


def test_pending_does_not_create_transport_until_authoritative_worker_closes() -> None:
    world, voice, root = setup()
    with pytest.raises(VoiceError, match="continuation_pending"):
        voice.continue_call(USER, root, "retry", "offer-2")
    assert len(world.provider.created) == 1
    assert root in world.provider.hung_up


def test_continuation_rechecks_consent_owner_and_current_language() -> None:
    world, voice, root = setup()
    with pytest.raises(VoiceError, match="continuation_unavailable"):
        voice.continue_call(UUID(int=999), root, "retry", "offer-2")
    world.accounts.accounts[USER] = replace(world.accounts.accounts[USER], voice_consent=False)
    with pytest.raises(VoiceError, match="consent_required"):
        voice.continue_call(USER, root, "retry", "offer-2")
    assert len(world.provider.created) == 1


def test_continuation_audio_belongs_to_root_and_namespaces_provider_item_ids() -> None:
    world, voice, root = setup()
    call = voice.live_call(root)
    assert call is not None
    call.closed()
    voice.finished(root, call)
    voice.continue_call(USER, root, "retry", "offer-2")
    child = world.starter.started[-1][0]
    original_keeper, child_keeper = voice.audio_keeper(root), voice.audio_keeper(child)
    assert original_keeper is not None
    assert child_keeper is not None
    original_audio = original_keeper(KeepAudio("same-item", "learner", b"\0\0"))
    child_audio = child_keeper(KeepAudio("same-item", "learner", b"\0\0"))
    assert original_audio.key != child_audio.key
    assert root in child_audio.key


def test_provider_failure_is_terminal_and_refunds_unused_reservation() -> None:
    world, voice, root = setup()
    call = voice.live_call(root)
    assert call is not None
    world.clock.now += timedelta(seconds=30)
    call.closed()
    voice.finished(root, call)
    world.provider.fail = True
    with pytest.raises(VoiceError, match="voice_unavailable"):
        voice.continue_call(USER, root, "attempt", "offer")
    with pytest.raises(VoiceError, match="continuation_unavailable"):
        voice.continue_call(USER, root, "attempt", "offer")
    assert root in world.sessions.finished
    assert voice.allowance(USER).used_seconds == 30
    assert len(world.provider.created) == 1


def test_cancel_during_provider_create_hangs_up_late_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    world, voice, root = setup()
    call = voice.live_call(root)
    assert call is not None
    call.closed()
    voice.finished(root, call)
    create = world.provider.create_call

    def late_create(*args: object, **kwargs: object) -> object:
        voice.end_call(USER, root)
        return create(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(world.provider, "create_call", late_create)
    with pytest.raises(VoiceError):
        voice.continue_call(USER, root, "attempt", "offer")
    assert "rtc_2" in world.provider.hung_up
    assert len(world.starter.started) == 1
    assert root in world.sessions.finished


def test_failed_replacement_worker_is_hung_up_and_concluded() -> None:
    world, voice, root = setup()
    call = voice.live_call(root)
    assert call is not None
    world.clock.now += timedelta(seconds=30)
    call.closed()
    voice.finished(root, call)
    world.starter.fail = True
    with pytest.raises(VoiceError, match="voice_unavailable"):
        voice.continue_call(USER, root, "attempt", "offer")
    assert "rtc_2" in world.provider.hung_up
    assert root in world.sessions.finished
    assert voice.allowance(USER).used_seconds == 30


def test_changed_target_language_and_paused_spend_do_not_create_replacement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from konvami_api.domain.costs import Level
    from konvami_api.domain.profile import Change, Origin, Source

    world, voice, root = setup()
    world.profiles.apply(
        USER, [Change("target_language", "fr")], source=Source.ASKED, origin=Origin.FORM
    )
    with pytest.raises(VoiceError, match="continuation_unavailable"):
        voice.continue_call(USER, root, "attempt", "offer")
    world.profiles.apply(
        USER, [Change("target_language", "de")], source=Source.ASKED, origin=Origin.FORM
    )
    monkeypatch.setattr(world.guard, "level", lambda: Level.PAUSED)
    with pytest.raises(VoiceError, match="voice_paused"):
        voice.continue_call(USER, root, "attempt", "offer")
    assert len(world.provider.created) == 1


def test_failed_refund_resumes_after_transcript_commit_without_losing_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    world, voice, root = setup()
    call = voice.live_call(root)
    assert call is not None
    world.clock.now += timedelta(seconds=20)
    call.closed()
    voice.finished(root, call)
    world.clock.now += timedelta(seconds=45)
    release = world.sessions.release_seconds

    def unavailable(*args: object) -> None:
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(world.sessions, "release_seconds", unavailable)
    with pytest.raises(RuntimeError):
        voice.finish_pending(root)
    monkeypatch.setattr(world.sessions, "release_seconds", release)
    assert not voice.finish_pending(root)
    assert voice.allowance(USER).used_seconds == 20


def test_retrying_failed_report_handoff_keeps_one_refund_and_one_charge() -> None:
    from konvami_api.domain.costs import Feature
    from konvami_api.domain.reports import ReportError

    world, voice, root = setup()
    call = voice.live_call(root)
    assert call is not None
    call.turns.append(Turn("learner", "Ich möchte heute über meine Arbeit sprechen."))
    world.clock.now += timedelta(seconds=20)
    call.closed()
    voice.finished(root, call)
    world.clock.now += timedelta(seconds=45)
    world.report_starter.fail = True
    with pytest.raises(ReportError):
        voice.finish_pending(root)
    world.report_starter.fail = False
    assert not voice.finish_pending(root)
    assert not voice.finish_pending(root)
    assert world.report_starter.started == [root]
    assert voice.allowance(USER).used_seconds == 20
    charges = [row for row in world.charges.records if row.feature is Feature.VOICE_PRACTICE]
    assert len(charges) == 1
    assert charges[0].units["call_seconds"] == 20


def test_lost_refund_response_does_not_return_allowance_twice(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from datetime import date

    world, voice, root = setup()
    call = voice.live_call(root)
    assert call is not None
    world.clock.now += timedelta(seconds=20)
    call.closed()
    voice.finished(root, call)
    world.clock.now += timedelta(seconds=45)
    refund = MemoryContinuations.refund
    first = True

    def lost(self: MemoryContinuations, root_id: str, user: UUID, week: date, seconds: int) -> None:
        nonlocal first
        refund(self, root_id, user, week, seconds)
        if first:
            first = False
            raise RuntimeError("reply lost after commit")

    monkeypatch.setattr(MemoryContinuations, "refund", lost)
    with pytest.raises(RuntimeError):
        voice.finish_pending(root)
    assert not voice.finish_pending(root)
    assert voice.allowance(USER).used_seconds == 20


def test_delayed_replacement_worker_keeps_original_deadline() -> None:
    world, voice, root = setup()
    call = voice.live_call(root)
    assert call is not None
    world.clock.now += timedelta(seconds=30)
    call.closed()
    voice.finished(root, call)
    voice.continue_call(USER, root, "attempt", "offer")
    world.clock.now += timedelta(seconds=15)
    child = world.starter.started[-1][0]
    replacement = voice.live_call(child)
    assert replacement is not None
    assert replacement.max_seconds == VOICE.max_seconds[CallPurpose.PRACTICE] - 45
