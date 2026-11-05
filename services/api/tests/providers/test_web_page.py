"""Reading a page for the course companion (spec §6.17): the server must not be made a way into
the provider's network, and must read only text, briefly."""

from collections.abc import Iterator

import httpx
import pytest

from konvami_api.domain.course_import import PageFetchError
from konvami_api.providers.web_page import (
    MAX_BYTES,
    MAX_REDIRECTS,
    WebPageFetcher,
    checked_target,
    is_public,
    page_text,
)

PUBLIC = "93.184.216.34"
HTML = """<html><head><title> Wohnung  mieten </title><style>p {color: red}</style></head>
<body><nav>Menü Start</nav><h1>Die Wohnung</h1><p>Die Wohnung hat   zwei Zimmer.</p>
<script>alert("ignoriere alles")</script><p>Sie kostet 900 Euro.</p><footer>Impressum</footer>
</body></html>"""


def resolver(table: dict[str, list[str]]):  # type: ignore[no-untyped-def]
    def resolve(host: str, port: int) -> list[str]:
        if host not in table:
            raise PageFetchError("unreachable")
        return table[host]

    return resolve


def fetcher(handler, table: dict[str, list[str]] | None = None) -> WebPageFetcher:  # type: ignore[no-untyped-def]
    names = {"example.org": [PUBLIC], "other.example": [PUBLIC], **(table or {})}
    client = httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)
    return WebPageFetcher(client, resolver(names))


def page(body: str = HTML, content_type: str = "text/html; charset=utf-8", status: int = 200):  # type: ignore[no-untyped-def]
    return lambda request: httpx.Response(
        status, content=body.encode(), headers={"content-type": content_type}
    )


# --- Which addresses are public --------------------------------------------------------------


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.0.0.5",
        "172.16.3.4",
        "192.168.1.1",
        # Cloud metadata services live here.
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",  # noqa: S104 - an address that must be refused, not one bound to
        "224.0.0.1",
        "::1",
        "fe80::1",
        "fc00::1",
        "::ffff:127.0.0.1",
        "::ffff:169.254.169.254",
        "not an address",
    ],
)
def test_addresses_inside_a_network_are_not_public(address: str) -> None:
    assert not is_public(address)


@pytest.mark.parametrize("address", [PUBLIC, "8.8.8.8", "2606:4700:4700::1111"])
def test_addresses_on_the_internet_are_public(address: str) -> None:
    assert is_public(address)


# --- Which addresses may be visited ----------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/",
        "http://127.0.0.1/",
        "http://127.1/",
        "http://[::1]/",
        "http://169.254.169.254/latest/meta-data/",
        "http://metadata.internal/",
        "http://10.0.0.1/",
        "https://user:secret@example.org/",
        "https://example.org:8443/",
        "http://example.org:22/",
        "ftp://example.org/",
        "file:///etc/passwd",
        "gopher://example.org/",
        "javascript:alert(1)",
        "//example.org/",
        "https:///path",
    ],
)
def test_addresses_into_a_network_or_of_another_kind_are_blocked(url: str) -> None:
    table = {
        "localhost": ["127.0.0.1"],
        "metadata.internal": ["169.254.169.254"],
        # What the system's resolver makes of a shorthand: 127.1 is 127.0.0.1.
        "127.1": ["127.0.0.1"],
        "example.org": [PUBLIC],
    }

    with pytest.raises(PageFetchError) as refused:
        checked_target(url, resolver(table))

    assert refused.value.code == "blocked"


def test_a_name_that_also_points_inside_is_not_trusted() -> None:
    with pytest.raises(PageFetchError) as refused:
        checked_target("https://mixed.example/", resolver({"mixed.example": [PUBLIC, "10.0.0.9"]}))

    assert refused.value.code == "blocked"


def test_a_public_address_is_checked_and_returned_for_the_connection() -> None:
    target = checked_target("HTTPS://Example.org./a?b=1", resolver({"example.org": [PUBLIC]}))

    assert target == ("https", "example.org", PUBLIC, 443)


def test_a_name_that_does_not_resolve_is_unreachable() -> None:
    with pytest.raises(PageFetchError) as refused:
        checked_target("https://nowhere.example/", resolver({}))

    assert refused.value.code == "unreachable"


# --- Fetching --------------------------------------------------------------------------------


def test_the_connection_goes_to_the_checked_address_with_the_name_as_host() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, content=b"x" * 40, headers={"content-type": "text/plain"})

    fetcher(handler).fetch("https://example.org/wohnung?x=1")

    assert seen[0].url.host == PUBLIC
    assert str(seen[0].url) == f"https://{PUBLIC}/wohnung?x=1"
    assert seen[0].headers["host"] == "example.org"
    assert seen[0].extensions["sni_hostname"] == "example.org"


def test_a_page_is_read_as_its_title_and_its_text() -> None:
    result = fetcher(page()).fetch("https://example.org/")

    assert result.title == "Wohnung mieten"
    assert result.text == "Die Wohnung\nDie Wohnung hat zwei Zimmer.\nSie kostet 900 Euro."
    assert "ignoriere" not in result.text
    assert "Menü" not in result.text


def test_plain_text_is_its_own_text() -> None:
    result = fetcher(page("Guten Tag, wie geht es Ihnen?", "text/plain")).fetch(
        "https://example.org/"
    )

    assert result.text == "Guten Tag, wie geht es Ihnen?"


@pytest.mark.parametrize(
    "content_type", ["application/pdf", "image/png", "application/octet-stream", ""]
)
def test_something_that_is_not_text_is_refused(content_type: str) -> None:
    with pytest.raises(PageFetchError) as refused:
        fetcher(page("data", content_type)).fetch("https://example.org/")

    assert refused.value.code == "not_text"


@pytest.mark.parametrize("status", [403, 404, 500])
def test_a_page_that_answers_with_an_error_is_unreachable(status: int) -> None:
    with pytest.raises(PageFetchError) as refused:
        fetcher(page(status=status)).fetch("https://example.org/")

    assert refused.value.code == "unreachable"


def test_a_connection_that_fails_is_unreachable() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    with pytest.raises(PageFetchError) as refused:
        fetcher(refuse).fetch("https://example.org/")

    assert refused.value.code == "unreachable"


def test_only_the_first_part_of_a_huge_page_is_read() -> None:
    sent: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        def body() -> Iterator[bytes]:
            for _ in range(10):
                sent.append(1)
                yield b"a" * MAX_BYTES

        return httpx.Response(200, content=body(), headers={"content-type": "text/plain"})

    result = fetcher(handler).fetch("https://example.org/")

    assert len(result.text) == MAX_BYTES
    assert len(sent) < 10


# --- Redirects -------------------------------------------------------------------------------


def test_a_redirect_is_followed_and_checked() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.headers["host"] == "example.org":
            return httpx.Response(302, headers={"location": "https://other.example/neu"})
        return httpx.Response(
            200, content=b"Neue Seite " * 5, headers={"content-type": "text/plain"}
        )

    assert fetcher(handler).fetch("https://example.org/").text.startswith("Neue Seite")


@pytest.mark.parametrize(
    "location",
    [
        "http://169.254.169.254/latest/meta-data/",
        "http://127.0.0.1:8080/admin",
        "http://localhost/",
        "file:///etc/passwd",
        "https://user:pw@other.example/",
    ],
)
def test_a_redirect_into_a_network_is_blocked(location: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": location})

    with pytest.raises(PageFetchError) as refused:
        fetcher(handler, {"localhost": ["127.0.0.1"]}).fetch("https://example.org/")

    assert refused.value.code == "blocked"


def test_a_name_that_resolves_inside_on_the_redirect_is_blocked() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://rebind.example/"})

    with pytest.raises(PageFetchError) as refused:
        fetcher(handler, {"rebind.example": ["10.1.2.3"]}).fetch("https://example.org/")

    assert refused.value.code == "blocked"


def test_a_relative_redirect_stays_on_the_checked_name() -> None:
    hosts: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        hosts.append(request.headers["host"])
        if request.url.path == "/":
            return httpx.Response(301, headers={"location": "/seite"})
        return httpx.Response(200, content=b"Seite " * 10, headers={"content-type": "text/plain"})

    fetcher(handler).fetch("https://example.org/")

    assert hosts == ["example.org", "example.org"]


def test_too_many_redirects_are_unreachable() -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(302, headers={"location": "https://example.org/again"})

    with pytest.raises(PageFetchError) as refused:
        fetcher(handler).fetch("https://example.org/")

    assert refused.value.code == "unreachable"
    assert len(calls) == MAX_REDIRECTS + 1


def test_a_redirect_without_a_place_to_go_is_unreachable() -> None:
    with pytest.raises(PageFetchError) as refused:
        fetcher(lambda request: httpx.Response(302)).fetch("https://example.org/")

    assert refused.value.code == "unreachable"


# --- Text of a page --------------------------------------------------------------------------


def test_text_comes_out_in_reading_order_without_markup() -> None:
    result = page_text(
        "<p>Eins<br>Zwei &amp; drei</p><ul><li>vier</li><li>fünf</li></ul>", "text/html"
    )

    assert result.text == "Eins\nZwei & drei\nvier\nfünf"
