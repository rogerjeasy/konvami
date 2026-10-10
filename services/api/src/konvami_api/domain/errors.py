"""Failures that are nobody's mistake and pass through every layer unchanged."""


class ServiceUnavailable(Exception):  # noqa: N818 - a temporary state, reported as HTTP 503
    """Something the request needs is not ready yet; the same request will work shortly."""

    def __init__(self, code: str, retry_after_seconds: int) -> None:
        super().__init__(code)
        self.code = code
        self.retry_after_seconds = retry_after_seconds
