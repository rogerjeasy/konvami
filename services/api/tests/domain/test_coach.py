"""The Coach's rules: signals found by code, their ranking with the learner's answers, and the
check of the model's wording (`domain/coach.py`)."""

import datetime as dt
from dataclasses import replace
from uuid import UUID, uuid4

import pytest

from konvami_api.domain.coach import (
    URGENT_FROM,
    Action,
    CoachInputs,
    ExamFact,
    FeedbackMemory,
    ImportFact,
    Kind,
    MistakeFact,
    PartnerFact,
    ReportFact,
    Signal,
    SoundFact,
    Suggestion,
    TopicFact,
    facts_for_model,
    find_signals,
    going_well,
    holding_back,
    invented_numbers,
    memory_of,
    rank,
    signal_document,
    signal_from,
    wording_of,
)

TODAY = dt.date(2026, 11, 20)
LENA = UUID("00000000-0000-4000-8000-00000000000a")
JONAS = UUID("00000000-0000-4000-8000-00000000000b")


def inputs(**changes: object) -> CoachInputs:
    base = CoachInputs(today=TODAY, hour=10, conversations=4, partner=LENA)
    return replace(base, **changes)  # type: ignore[arg-type]


def kinds(found: list[Signal]) -> set[Kind]:
    return {signal.kind for signal in found}


def dative(severity: str = "noticeable") -> MistakeFact:
    return MistakeFact("case_dative", "dative", severity, "mit der Mann", "mit dem Mann")


def report(call: str, *mistakes: MistakeFact, retried: int = 0) -> ReportFact:
    return ReportFact(call, mistakes, retried)


def test_a_learner_who_never_practised_gets_nothing() -> None:
    assert find_signals(inputs(conversations=0)) == []


def test_a_mistake_in_three_recent_conversations_is_recurring_with_the_learners_words() -> None:
    reports = (report("c3", dative()), report("c2", dative()), report("c1", dative(), dative()))

    found = [
        s
        for s in find_signals(
            inputs(
                reports=reports,
                mistakes_this_week={"case_dative": 2},
                mistakes_last_week={"case_dative": 3},
            )
        )
        if s.kind is Kind.RECURRING_MISTAKE
    ]

    assert len(found) == 1
    signal = found[0]
    assert signal.key == "case_dative"
    assert signal.evidence["conversations"] == 3
    assert signal.evidence["count"] == 4
    assert (signal.evidence["said"], signal.evidence["corrected"]) == (
        "mit der Mann",
        "mit dem Mann",
    )
    assert signal.action == Action("lesson", topic="dative", partner=LENA)
    assert signal.trend == "better"


def test_a_mistake_in_two_conversations_is_not_recurring_yet() -> None:
    reports = (report("c2", dative()), report("c1"), report("c0", dative()))

    assert Kind.RECURRING_MISTAKE not in kinds(find_signals(inputs(reports=reports)))


def test_a_recurring_mistake_about_single_words_is_said_better_instead() -> None:
    word = MistakeFact("vocabulary", None, "minor", "Ich bin kalt", "Mir ist kalt")
    reports = tuple(report(f"c{n}", word) for n in range(3))

    found = next(
        s for s in find_signals(inputs(reports=reports)) if s.kind is Kind.RECURRING_MISTAKE
    )

    assert found.action == Action("say_it_better", call_id="c0")


def test_a_serious_recurring_mistake_weighs_more() -> None:
    plain = tuple(report(f"c{n}", dative()) for n in range(3))
    serious = tuple(report(f"c{n}", dative("blocks_meaning")) for n in range(3))

    def score(reports: tuple[ReportFact, ...]) -> int:
        return next(
            s.score
            for s in find_signals(inputs(reports=reports))
            if s.kind is Kind.RECURRING_MISTAKE
        )

    assert score(serious) > score(plain)


def test_corrections_not_yet_said_again_are_suggested_once() -> None:
    waiting = inputs(reports=(report("c1", dative(), dative()),))
    retried = inputs(reports=(report("c1", dative(), dative(), retried=1),))

    found = next(s for s in find_signals(waiting) if s.kind is Kind.SAY_IT_BETTER)
    assert found.evidence["count"] == 2
    assert found.action == Action("say_it_better", call_id="c1")
    assert Kind.SAY_IT_BETTER not in kinds(find_signals(retried))


def topic(**changes: object) -> TopicFact:
    base = TopicFact("dative", "practising", 0.5, 6, "slipping", 2, "practising")
    return replace(base, **changes)  # type: ignore[arg-type]


def test_a_topic_used_often_and_mostly_wrong_is_weak() -> None:
    found = next(s for s in find_signals(inputs(topics=(topic(),))) if s.kind is Kind.WEAK_TOPIC)

    assert found.evidence == {"topic": "dative", "accuracy": 50, "uses": 6, "days": 2}
    assert found.trend == "worse"
    assert found.action == Action("lesson", topic="dative", partner=LENA)


@pytest.mark.parametrize("changes", [{"uses": 3}, {"accuracy": 0.7}])
def test_a_topic_used_rarely_or_mostly_right_is_not_weak(changes: dict[str, object]) -> None:
    assert Kind.WEAK_TOPIC not in kinds(find_signals(inputs(topics=(topic(**changes),))))


def test_a_pile_of_cards_or_old_ones_are_overdue() -> None:
    many = next(s for s in find_signals(inputs(cards_due=40)) if s.kind is Kind.CARDS_OVERDUE)
    old = next(
        s
        for s in find_signals(inputs(cards_due=4, oldest_due_days=5))
        if s.kind is Kind.CARDS_OVERDUE
    )

    assert many.action == Action("review_cards", count=20)
    assert many.minutes == 5
    assert old.action == Action("review_cards", count=4)
    assert Kind.CARDS_OVERDUE not in kinds(find_signals(inputs(cards_due=4, oldest_due_days=1)))


def test_words_forgotten_again_and_again_ask_for_a_review_conversation() -> None:
    found = find_signals(inputs(lapsing=("Bahnhof", "Rechnung", "Miete", "Kasse"), words_due=8))

    lapsing = next(s for s in found if s.kind is Kind.CARDS_LAPSING)
    assert lapsing.evidence == {"count": 4, "words": ["Bahnhof", "Rechnung", "Miete"]}
    assert lapsing.action == Action("review_conversation", partner=LENA)
    # One review conversation is enough: the due words wait for it.
    assert Kind.REVIEW_DUE not in kinds(found)
    assert Kind.REVIEW_DUE in kinds(find_signals(inputs(words_due=8)))


def test_a_hard_sound_is_drilled() -> None:
    hard = SoundFact("ch", "ich and ach", tries=5, right=2, score=None, problem_words=("Milch",))
    scored = SoundFact("r", "R", tries=1, right=1, score=62.4)
    fine = SoundFact("ue", "ü", tries=6, right=6, score=91.0)

    found = [
        s for s in find_signals(inputs(sounds=(hard, scored, fine))) if s.kind is Kind.PROBLEM_SOUND
    ]

    assert {s.key for s in found} == {"ch", "r"}
    by_key = {s.key: s for s in found}
    assert by_key["r"].evidence["score"] == 62
    assert by_key["ch"].action == Action("sound_drill", sound="ch")
    assert by_key["r"].score > by_key["ch"].score


def exam(**changes: object) -> ExamFact:
    base = ExamFact("goethe_b1", "Goethe-Zertifikat B1", 10, 0, 0, 20)
    return replace(base, **changes)  # type: ignore[arg-type]


def test_an_exam_close_without_a_recent_simulation_is_urgent() -> None:
    found = next(s for s in find_signals(inputs(exam=exam())) if s.kind is Kind.EXAM_NEAR)

    assert found.urgent
    assert found.score >= URGENT_FROM
    assert found.action == Action("exam", exam="goethe_b1")


def test_an_exam_further_away_asks_gently_and_not_after_a_recent_simulation() -> None:
    near = next(
        s for s in find_signals(inputs(exam=exam(days_left=40))) if s.kind is Kind.EXAM_NEAR
    )
    assert not near.urgent
    done = inputs(exam=exam(days_left=40, simulations_7_days=1, simulations_14_days=1, last_days=3))
    assert Kind.EXAM_NEAR not in kinds(find_signals(done))
    # Never simulated: a first one shows where the learner stands, however far the exam.
    never = inputs(exam=exam(days_left=None, last_days=None))
    assert Kind.EXAM_NEAR in kinds(find_signals(never))


def test_conversations_pointing_up_say_the_next_level_is_close() -> None:
    found = next(
        s
        for s in find_signals(inputs(level="A2", level_up=3, level_counted=3))
        if s.kind is Kind.LEVEL_CLOSE
    )

    assert found.evidence == {"level": "A2", "next": "B1", "count": 3, "needed": 2}
    assert Kind.LEVEL_CLOSE not in kinds(
        find_signals(inputs(level="A2", level_up=3, level_down=1, level_counted=4))
    )


def test_a_long_gap_brings_a_short_conversation_and_never_a_streak_warning() -> None:
    found = find_signals(inputs(days_since_practice=6, streak=0, hour=20))

    gap = next(s for s in found if s.kind is Kind.LONG_GAP)
    assert gap.evidence == {"days": 6}
    assert gap.minutes == 5
    assert Kind.STREAK_AT_RISK not in kinds(found)


def test_a_run_of_days_is_worth_keeping_late_in_the_day() -> None:
    evening = find_signals(inputs(streak=4, hour=19, cards_due=3, days_since_practice=1))
    morning = find_signals(inputs(streak=4, hour=9, cards_due=3, days_since_practice=1))
    done = find_signals(inputs(streak=4, hour=19, practised_today=True, days_since_practice=0))

    keep = next(s for s in evening if s.kind is Kind.STREAK_AT_RISK)
    assert keep.action == Action("review_cards", count=3)
    assert Kind.STREAK_AT_RISK not in kinds(morning)
    assert Kind.STREAK_AT_RISK not in kinds(done)


def test_a_day_the_plan_leaves_free_never_puts_the_streak_at_risk() -> None:
    rest = find_signals(
        inputs(streak=4, hour=19, cards_due=3, days_since_practice=1, planned_today=False)
    )

    assert Kind.STREAK_AT_RISK not in kinds(rest)


def test_a_partner_not_met_for_long_is_suggested() -> None:
    partners = (
        PartnerFact(LENA, "Lena", 8, 0),
        PartnerFact(JONAS, "Jonas", 2, 30),
    )

    found = next(
        s for s in find_signals(inputs(partners=partners)) if s.kind is Kind.PARTNER_UNVISITED
    )

    assert found.evidence == {"partner": str(JONAS), "name": "Jonas", "days": 30}
    assert found.action == Action("call_partner", partner=JONAS)


def test_a_fresh_import_is_suggested_for_a_talk() -> None:
    newer, older = uuid4(), uuid4()
    imports = (
        ImportFact(older, "Mietvertrag", 9),
        ImportFact(newer, "Speisekarte", 2),
        ImportFact(uuid4(), "Heute", 0),
    )

    found = next(s for s in find_signals(inputs(imports=imports)) if s.kind is Kind.IMPORT_WAITING)

    assert found.key == str(newer)
    assert found.action == Action("import_call", import_id=newer, partner=LENA)


def test_good_news_is_found_and_has_no_action() -> None:
    found = find_signals(
        inputs(
            topics=(topic(state="mostly_correct", state_week_ago="practising", accuracy=0.8),),
            mistakes_this_week={"case_dative": 1},
            mistakes_last_week={"case_dative": 4},
            reports=(report("c1"),),
            pace_before=80.0,
            pace_after=95.0,
            level_raised_to="B1",
            streak=5,
            best_streak=5,
            reviews_7_days=30,
            remembered_7_days=27,
        )
    )
    good = {s.kind: s for s in found if s.positive}

    assert set(good) >= {
        Kind.TOPIC_IMPROVED,
        Kind.FEWER_MISTAKES,
        Kind.PACE_UP,
        Kind.LEVEL_UP,
        Kind.STREAK_BEST,
        Kind.CARDS_REMEMBERED,
    }
    assert all(s.action is None for s in good.values())
    assert good[Kind.PACE_UP].evidence == {"before": 80, "after": 95}
    assert good[Kind.CARDS_REMEMBERED].evidence == {"share": 90, "count": 30}


def test_fewer_mistakes_after_a_quiet_week_says_nothing() -> None:
    found = find_signals(
        inputs(mistakes_this_week={}, mistakes_last_week={"x": 2}, reports=(report("c1"),))
    )
    assert Kind.FEWER_MISTAKES not in kinds(found)


def sig(kind: Kind, score: int, key: str = "", minutes: int = 10, urgent: bool = False) -> Signal:
    return Signal(kind, key, score, {}, Action("free_talk", partner=LENA), minutes, urgent)


def test_ranking_puts_the_urgent_first_then_the_score_and_keeps_one_of_each_kind() -> None:
    signals = [
        sig(Kind.WEAK_TOPIC, 60, "dative"),
        sig(Kind.WEAK_TOPIC, 55, "perfect"),
        sig(Kind.EXAM_NEAR, 50, urgent=True),
        sig(Kind.CARDS_OVERDUE, 70),
        Signal(Kind.FEWER_MISTAKES, "", 99, {}, positive=True),
    ]

    ranked = rank(signals)

    assert [(s.kind, s.key) for s in ranked] == [
        (Kind.EXAM_NEAR, ""),
        (Kind.CARDS_OVERDUE, ""),
        (Kind.WEAK_TOPIC, "dative"),
    ]


def test_ranking_follows_what_the_learner_said() -> None:
    signals = [
        sig(Kind.WEAK_TOPIC, 60, "dative"),
        sig(Kind.CARDS_OVERDUE, 55, minutes=4),
        sig(Kind.PROBLEM_SOUND, 50, "ch", minutes=5),
        sig(Kind.LONG_GAP, 40),
    ]

    muted = rank(signals, FeedbackMemory(muted_kinds=frozenset({Kind.WEAK_TOPIC})))
    assert Kind.WEAK_TOPIC not in {s.kind for s in muted}
    known = rank(signals, FeedbackMemory(muted_keys=frozenset({(Kind.PROBLEM_SOUND, "ch")})))
    assert Kind.PROBLEM_SOUND not in {s.kind for s in known}
    liked = rank(signals, FeedbackMemory(accepted={Kind.LONG_GAP: 5}))
    assert liked.index(next(s for s in liked if s.kind is Kind.LONG_GAP)) == 2
    short = rank(signals, FeedbackMemory(prefers_short=True))
    assert [s.kind for s in short][:2] == [Kind.CARDS_OVERDUE, Kind.PROBLEM_SOUND]


def suggestion(
    kind: Kind, status: str, reason: str | None = None, days_ago: int = 0, key: str = ""
) -> Suggestion:
    return Suggestion(
        uuid4(),
        TODAY - dt.timedelta(days=days_ago),
        0,
        kind,
        key,
        {},
        Action("free_talk", partner=LENA),
        10,
        False,
        status=status,  # type: ignore[arg-type]
        reason=reason,  # type: ignore[arg-type]
    )


def test_the_learners_answers_become_a_memory() -> None:
    memory = memory_of(
        [
            suggestion(Kind.WEAK_TOPIC, "dismissed", "not_interested", days_ago=3),
            suggestion(Kind.LONG_GAP, "dismissed", "not_useful", days_ago=40),
            suggestion(Kind.PROBLEM_SOUND, "dismissed", "already_know", days_ago=60, key="ch"),
            suggestion(Kind.CARDS_OVERDUE, "snoozed"),
            suggestion(Kind.EXAM_NEAR, "snoozed", days_ago=1),
            suggestion(Kind.REVIEW_DUE, "accepted", days_ago=2),
            suggestion(Kind.REVIEW_DUE, "accepted", days_ago=5),
            suggestion(Kind.LEVEL_CLOSE, "dismissed", "too_long", days_ago=4),
        ],
        TODAY,
    )

    assert memory.muted_kinds == {Kind.WEAK_TOPIC}
    assert memory.muted_keys == {(Kind.PROBLEM_SOUND, "ch")}
    # "Not now" lasts the day.
    assert memory.snoozed == {(Kind.CARDS_OVERDUE, "")}
    assert memory.accepted == {Kind.REVIEW_DUE: 2}
    assert memory.prefers_short


def test_holding_back_and_going_well_split_the_signals() -> None:
    signals = [
        sig(Kind.WEAK_TOPIC, 60, "dative"),
        Signal(Kind.PLAN_MISSED, "", 40, {"days": 2}),
        Signal(Kind.PACE_UP, "", 45, {}, positive=True),
    ]

    assert [s.kind for s in holding_back(signals)] == [Kind.WEAK_TOPIC, Kind.PLAN_MISSED]
    assert [s.kind for s in going_well(signals)] == [Kind.PACE_UP]


def test_a_signal_survives_being_stored() -> None:
    signal = Signal(Kind.WEAK_TOPIC, "dative", 60, {"topic": "dative"}, trend="worse")

    assert signal_from(signal_document(signal)) == signal


def test_an_action_survives_being_stored() -> None:
    action = Action("import_call", import_id=uuid4(), partner=LENA)

    assert Action.from_document(action.document()) == action


def candidate(
    kind: Kind, evidence: dict[str, object], rank: int, urgent: bool = False
) -> Suggestion:
    return Suggestion(
        uuid4(),
        TODAY,
        rank,
        kind,
        "",
        evidence,
        Action("lesson", topic="dative", partner=LENA),
        10,
        urgent,
    )


def test_the_model_reads_facts_with_topic_names_and_no_ids() -> None:
    first = candidate(Kind.WEAK_TOPIC, {"topic": "dative", "accuracy": 50}, 0)
    imported = replace(first, evidence={"import": "abc", "title": "Menu"}, kind=Kind.IMPORT_WAITING)

    facts = facts_for_model([first, imported], {"dative": "Dative case"})

    assert facts[0]["evidence"] == {"topic": "Dative case", "accuracy": 50}
    assert facts[1]["evidence"] == {"title": "Menu"}
    assert facts[0]["minutes"] == 10


def test_a_wording_with_an_invented_number_is_refused() -> None:
    assert invented_numbers("You got 50% right in 6 uses", {"accuracy": 50, "uses": 6}) == set()
    assert invented_numbers("You got 70% right", {"accuracy": 50}) == {"70"}


def test_the_models_wording_orders_the_candidates_it_chose() -> None:
    first = candidate(Kind.WEAK_TOPIC, {"accuracy": 50}, 2)
    second = candidate(Kind.CARDS_OVERDUE, {"due": 30}, 3)
    third = candidate(Kind.LONG_GAP, {"days": 6}, 4)
    candidates = [first, second, third]
    facts = facts_for_model(candidates, {})

    words = wording_of(
        {
            "suggestions": [
                {"id": str(second.id), "title": "Review 30 cards", "why": "30 cards are due."},
                {"id": str(first.id), "title": "A short lesson", "why": "You got 50% right."},
            ]
        },
        candidates,
        facts,
    )

    assert words == {
        second.id: (2, "Review 30 cards", "30 cards are due."),
        first.id: (3, "A short lesson", "You got 50% right."),
        third.id: (4, "", ""),
    }


@pytest.mark.parametrize(
    "words",
    [
        [{"id": "not-one", "title": "x", "why": "y"}],
        [],
        # 40 is not in the facts.
        [{"id": "ID", "title": "Do 40 cards", "why": "Now."}],
        [{"id": "ID", "title": "Cards", "why": "Due."}, {"id": "ID", "title": "Again", "why": "."}],
    ],
)
def test_a_wording_that_does_not_hold_is_refused(words: list[dict[str, str]]) -> None:
    only = candidate(Kind.CARDS_OVERDUE, {"due": 30}, 0)
    answer = {"suggestions": [{**w, "id": w["id"].replace("ID", str(only.id))} for w in words]}

    assert wording_of(answer, [only], facts_for_model([only], {})) is None
    assert wording_of({"wrong": True}, [only], facts_for_model([only], {})) is None


def test_an_urgent_candidate_must_stay_first() -> None:
    urgent = candidate(Kind.EXAM_NEAR, {"days": 10}, 0, urgent=True)
    other = candidate(Kind.CARDS_OVERDUE, {"due": 30}, 1)
    candidates = [urgent, other]
    answer = {
        "suggestions": [
            {"id": str(other.id), "title": "Cards", "why": "Some are due."},
            {"id": str(urgent.id), "title": "Simulate", "why": "The exam is close."},
        ]
    }

    assert wording_of(answer, candidates, facts_for_model(candidates, {})) is None
