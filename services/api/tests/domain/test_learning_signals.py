from konvami_api.domain.learning_signals import learning_signals
from konvami_api.domain.live_call import Turn


def test_only_learner_requests_and_explicit_self_reports_are_evidence() -> None:
    signals = learning_signals(
        (
            Turn("persona", "I am bored"),
            Turn("learner", "Could you repeat that?"),
            Turn("learner", "I don't understand. I'm frustrated."),
            Turn("learner", "This exercise is too easy."),
        ),
        "en",
    )
    assert [signal.kind for signal in signals] == [
        "repeat_request",
        "comprehension_request",
        "frustration_statement",
        "challenge_request",
    ]
    assert [signal.turn for signal in signals] == [1, 2, 2, 3]
    assert all(signal.quote for signal in signals)


def test_short_slow_or_quiet_responses_are_never_emotional_evidence() -> None:
    assert learning_signals((Turn("learner", "Hmm. Okay."),), "en") == ()
    assert learning_signals((Turn("learner", "I'm not bored."),), "en") == ()


def test_all_target_languages_have_request_patterns_without_substring_matches() -> None:
    for language, text in [
        ("de", "Kannst du das wiederholen?"),
        ("fr", "Peux-tu répéter ?"),
        ("it", "Puoi ripetere?"),
    ]:
        assert learning_signals((Turn("learner", text),), language)[0].kind == "repeat_request"
    assert learning_signals((Turn("learner", "repeating"),), "en") == ()
