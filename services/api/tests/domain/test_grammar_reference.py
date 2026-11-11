from konvami_api.domain.catalog import GERMAN
from konvami_api.domain.grammar_reference import references, search_references


def test_every_map_topic_has_a_reference_with_curated_examples() -> None:
    found = references(GERMAN)
    assert {entry.id for entry in found} == {topic.id for topic in GERMAN.grammar_map}
    assert all(entry.examples for entry in found)


def test_search_finds_rules_and_examples_case_insensitively() -> None:
    found = search_references(GERMAN, "MIT DEM BUS")
    assert found[0].id == "dative"
    assert any("dative" in rule.lower() for rule in found[0].rules)


def test_search_matches_topic_titles_and_returns_nothing_for_unknown_terms() -> None:
    assert search_references(GERMAN, "present tense")[0].id == "present_tense"
    assert search_references(GERMAN, "quuxxyz") == ()


def test_empty_search_lists_the_reference_and_limit_is_bounded() -> None:
    assert search_references(GERMAN, "") == references(GERMAN)
    assert len(search_references(GERMAN, "", limit=2)) == 2
    assert search_references(GERMAN, "", limit=0) == ()
