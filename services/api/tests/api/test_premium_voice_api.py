"""Premium voices over HTTP (spec §6.21.2): what is on offer, choosing one, hearing a sample."""

from dataclasses import replace
from uuid import UUID

from konvami_api.domain.speech import SpeechError
from tests.api.conftest import USER, Call
from tests.api.test_api import onboarded
from tests.fakes import FakeAccountDirectory, FakeSpeechModel, InMemoryFileStore, ScriptedTextModel

MAYA = {"id": "Maya123", "name": "Maya"}


def agree(directory: FakeAccountDirectory) -> None:
    directory.accounts[UUID(USER)] = replace(
        directory.accounts[UUID(USER)], premium_voice_consent=True
    )


def test_the_voices_on_offer_are_listed_with_what_the_learner_may_do(call: Call) -> None:
    response = call("GET", "/v1/premium-voices")

    assert response.status == 200
    assert response.body == {
        "offered": True,
        "consent": False,
        "allowed": True,
        "voices": [MAYA, {"id": "Otto456", "name": "Otto"}],
        "chosen": None,
    }


def test_a_voice_cannot_be_chosen_without_the_consent_to_elevenlabs(call: Call) -> None:
    response = call("PUT", "/v1/premium-voices/choice", {"voiceId": "Maya123"})

    assert response.status == 403
    assert response.body == {"error": {"code": "consent_needed", "field": None}}


def test_a_chosen_voice_is_kept_and_can_be_given_up(
    call: Call, directory: FakeAccountDirectory
) -> None:
    agree(directory)

    chosen = call("PUT", "/v1/premium-voices/choice", {"voiceId": "Maya123"})
    after = call("GET", "/v1/premium-voices")
    given_up = call("PUT", "/v1/premium-voices/choice", {"voiceId": None})

    assert chosen.status == 200
    assert chosen.body["chosen"] == "Maya123"
    assert after.body["chosen"] == "Maya123"
    assert given_up.body["chosen"] is None


def test_a_voice_that_is_not_on_offer_is_refused(
    call: Call, directory: FakeAccountDirectory
) -> None:
    agree(directory)

    response = call("PUT", "/v1/premium-voices/choice", {"voiceId": "Nobody999"})

    assert response.status == 422
    assert response.body == {"error": {"code": "unknown_voice", "field": None}}


def test_a_sample_is_an_address_to_play(
    call: Call,
    text_model: ScriptedTextModel,
    directory: FakeAccountDirectory,
    files: InMemoryFileStore,
    premium_speech: FakeSpeechModel,
) -> None:
    onboarded(call, text_model)
    agree(directory)

    response = call("GET", "/v1/premium-voices/Maya123/sample")

    assert response.status == 200
    [key] = [key for key in files.files if key.startswith("voices/premium/")]
    assert response.body == {"url": f"https://files.test/{key}?expires=3600"}
    assert files.files[key] == (b"mp3:Maya123", "audio/mpeg")
    assert len(premium_speech.tasks) == 1


def test_a_sample_needs_the_consent_too(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)

    response = call("GET", "/v1/premium-voices/Maya123/sample")

    assert response.status == 403
    assert response.body == {"error": {"code": "consent_needed", "field": None}}


def test_a_sample_that_cannot_be_spoken_asks_to_try_again(
    call: Call,
    text_model: ScriptedTextModel,
    directory: FakeAccountDirectory,
    premium_speech: FakeSpeechModel,
) -> None:
    onboarded(call, text_model)
    agree(directory)
    premium_speech.fail = SpeechError("timeout")

    response = call("GET", "/v1/premium-voices/Maya123/sample")

    assert response.status == 503
    assert response.body == {"error": {"code": "voice_unavailable", "field": None}}


def test_the_voices_need_a_signed_in_learner(call: Call) -> None:
    assert call("GET", "/v1/premium-voices", subject=None).status == 401
