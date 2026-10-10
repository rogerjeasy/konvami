import asyncio
from collections.abc import Iterator

import pytest


@pytest.fixture(autouse=True)
def event_loop_for_lambda_adapter() -> Iterator[None]:
    """Gives each test its own event loop and closes it afterwards.

    The Lambda adapter (Mangum) uses the current event loop and creates one when there is none,
    which it never closes: fine once per Lambda container, a leak once per test.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield
    loop.close()
    asyncio.set_event_loop(None)
