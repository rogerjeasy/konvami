from konvami_api.domain.conversations import ConversationQuery
from tests.world import NOON, USER, World


def test_library_search_reads_learner_words_and_never_other_accounts() -> None:
    world = World()
    lena, _ = world.onboard()
    found = world.talk(lena, at=NOON, learner_says=("Gut, danke",))
    assert [
        item.id
        for item in world.conversations.listed(
            USER, query=ConversationQuery(text="Gut")
        ).conversations
    ] == [found]
    assert (
        world.conversations.listed(
            USER, query=ConversationQuery(text="missing phrase")
        ).conversations
        == ()
    )


def test_library_search_honours_partner_and_mode() -> None:
    world = World()
    lena, jonas = world.onboard()
    found = world.talk(lena, at=NOON, learner_says=("Gut, danke",))
    assert [
        item.id
        for item in world.conversations.listed(
            USER, query=ConversationQuery(partner=lena.id)
        ).conversations
    ] == [found]
    assert (
        world.conversations.listed(USER, query=ConversationQuery(partner=jonas.id)).conversations
        == ()
    )
    assert (
        world.conversations.listed(USER, query=ConversationQuery(mode="role_play")).conversations
        == ()
    )
