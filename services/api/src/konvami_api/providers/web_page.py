"""Reading a web page the learner pastes the address of (spec §6.17).

The address is the learner's, so the server must not be made a way into the provider's own
network (server-side request forgery): only http and https on their usual ports, no credentials
in the address, and every address the name resolves to must be a public one. The connection goes
to the address that was checked, not to the name again, so a name that answers differently the
second time (DNS rebinding) gains nothing; the name still travels as the `Host` header and as
the TLS server name, so certificates are checked as usual. A redirect is followed by hand, a few
times at most, and checked as if it were the first address. The page is read for a few seconds
and a few hundred kilobytes, and only if it is text.
"""

import ipaddress
import socket
import time
from collections.abc import Callable
from html.parser import HTMLParser
from typing import ClassVar
from urllib.parse import urljoin, urlsplit

import httpx

from konvami_api.domain.course_import import FetchedPage, PageFetchError

# The most redirects followed.
MAX_REDIRECTS = 3
# The most of a page that is read (bytes); a longer page is cut, which is enough to work from.
MAX_BYTES = 1024 * 1024
# How long the whole page may take, and how long one step (connecting, one chunk) may.
TOTAL_SECONDS = 10.0
STEP_SECONDS = 5.0
# What a page of text is.
_TEXT_TYPES = ("text/html", "text/plain", "application/xhtml+xml")
_PORTS = {"http": 80, "https": 443}
# Browsers send this; some sites refuse a client without one.
_USER_AGENT = "Mozilla/5.0 (compatible; KonvamiBot/1.0; reads a page a learner shared)"

type Resolver = Callable[[str, int], list[str]]


def resolve(host: str, port: int) -> list[str]:
    """Every address a name resolves to."""
    try:
        found = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        raise PageFetchError("unreachable") from None
    return list({str(entry[4][0]) for entry in found})


def is_public(address: str) -> bool:
    """Whether an address is on the public internet: not this machine, a private network, a
    link-local address (where cloud metadata services live), shared or reserved space."""
    try:
        ip = ipaddress.ip_address(address.split("%")[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def checked_target(url: str, resolver: Resolver) -> tuple[str, str, str, int]:
    """Where to connect for an address: (scheme, host name, the public IP address, port).
    Raises `PageFetchError` (`blocked`, or `unreachable` for a name that does not resolve)."""
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").rstrip(".")
    try:
        port = parts.port or _PORTS.get(scheme, 0)
    except ValueError:
        raise PageFetchError("blocked") from None
    if scheme not in _PORTS or not host or parts.username or parts.password:
        raise PageFetchError("blocked")
    if port != _PORTS[scheme]:
        raise PageFetchError("blocked")
    addresses = [host] if _is_literal(host) else resolver(host, port)
    # Every answer must be public: a name that also points inside is not trusted.
    if not addresses or not all(is_public(address) for address in addresses):
        raise PageFetchError("blocked")
    return scheme, host, addresses[0], port


def _is_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


class _Text(HTMLParser):
    """The text of a page: no scripts, styles or navigation, a line break at each block."""

    _SKIPPED: ClassVar[frozenset[str]] = frozenset(
        {"script", "style", "noscript", "svg", "head", "nav", "footer", "form", "iframe"}
    )
    _BREAKS: ClassVar[frozenset[str]] = frozenset(
        {
            "p",
            "div",
            "br",
            "li",
            "tr",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "section",
            "article",
        }
    )

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self._skip = 0
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
        elif tag in self._SKIPPED:
            self._skip += 1
        elif tag in self._BREAKS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag in self._SKIPPED:
            self._skip = max(0, self._skip - 1)
        elif tag in self._BREAKS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        elif not self._skip:
            self._parts.append(data)

    @property
    def text(self) -> str:
        lines = ("".join(self._parts)).splitlines()
        return "\n".join(" ".join(line.split()) for line in lines if line.strip())


def page_text(body: str, content_type: str) -> FetchedPage:
    """A page's title and text. Plain text is its own text."""
    if content_type.startswith("text/plain"):
        return FetchedPage("", body)
    reader = _Text()
    reader.feed(body)
    reader.close()
    return FetchedPage(" ".join(reader.title.split()), reader.text)


class WebPageFetcher:
    def __init__(
        self,
        http: httpx.Client | None = None,
        resolver: Resolver = resolve,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        # No redirects, no environment proxies: every hop is checked here.
        self._http = http or httpx.Client(follow_redirects=False, trust_env=False)
        self._resolver = resolver
        self._clock = clock

    def fetch(self, url: str) -> FetchedPage:
        deadline = self._clock() + TOTAL_SECONDS
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            scheme, host, address, _port = checked_target(current, self._resolver)
            parts = urlsplit(current)
            shown = f"[{address}]" if ":" in address else address
            target = f"{scheme}://{shown}{parts.path or '/'}" + (
                f"?{parts.query}" if parts.query else ""
            )
            try:
                with self._http.stream(
                    "GET",
                    target,
                    headers={"Host": host, "User-Agent": _USER_AGENT, "Accept": "text/html,*/*"},
                    extensions={"sni_hostname": host},
                    timeout=STEP_SECONDS,
                ) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise PageFetchError("unreachable")
                        current = urljoin(current, location)
                        continue
                    return self._read(response, deadline)
            except httpx.HTTPError:
                raise PageFetchError("unreachable") from None
        raise PageFetchError("unreachable")

    def _read(self, response: httpx.Response, deadline: float) -> FetchedPage:
        if not response.is_success:
            raise PageFetchError("unreachable")
        content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type not in _TEXT_TYPES:
            raise PageFetchError("not_text")
        body = bytearray()
        for chunk in response.iter_bytes():
            body.extend(chunk)
            if len(body) >= MAX_BYTES or self._clock() > deadline:
                break
        try:
            text = bytes(body[:MAX_BYTES]).decode(response.charset_encoding or "utf-8", "replace")
        except LookupError:  # A character set Python does not know.
            text = bytes(body[:MAX_BYTES]).decode("utf-8", "replace")
        return page_text(text, content_type)
