import datetime as dt
from uuid import UUID

from konvami_api.domain.halves_match import Seeker, fit, pairs

NOON = dt.datetime(2026, 11, 20, 12, tzinfo=dt.UTC)


def seeker(n: int, native: str, target: str, *, band: str = "adult", hours: int = 0) -> Seeker:
    return Seeker(
        UUID(int=n),
        "adult" if band == "adult" else "minor",
        native,
        target,
        NOON + dt.timedelta(hours=hours),
    )


def never(_: UUID, __: UUID) -> bool:
    return False


def test_a_mirror_fits_better_than_the_same_language() -> None:
    lena = seeker(1, "de", "fr")
    assert fit(lena, seeker(2, "fr", "de")) == "mirror"
    assert fit(lena, seeker(3, "en", "fr")) == "same"
    assert fit(lena, seeker(4, "it", "en")) is None


def test_minors_and_unknown_languages_are_never_matched() -> None:
    lena = seeker(1, "de", "fr")
    assert fit(lena, seeker(2, "fr", "de", band="minor")) is None
    assert fit(seeker(3, "de", "fr", band="minor"), seeker(4, "fr", "de", band="minor")) is None
    assert fit(seeker(5, "de", "xx"), seeker(6, "xx", "de")) is None
    assert fit(lena, lena) is None


def test_the_longest_waiting_is_paired_first_with_a_mirror() -> None:
    first = seeker(1, "de", "fr", hours=0)
    same = seeker(2, "en", "fr", hours=1)
    mirror = seeker(3, "fr", "de", hours=2)
    made = pairs([mirror, same, first], never)
    assert [(a.user_id, b.user_id, kind) for a, b, kind in made] == [
        (first.user_id, mirror.user_id, "mirror")
    ]


def test_a_block_either_way_keeps_two_apart() -> None:
    one, other = seeker(1, "de", "fr"), seeker(2, "fr", "de")
    assert pairs([one, other], lambda a, b: {a, b} == {one.user_id, other.user_id}) == []


def test_each_seeker_is_in_one_pair_at_most() -> None:
    group = [seeker(n, "de", "fr", hours=n) for n in range(1, 6)]
    made = pairs(group, never)
    paired = [s.user_id for a, b, _ in made for s in (a, b)]
    assert len(made) == 2
    assert len(paired) == len(set(paired))
