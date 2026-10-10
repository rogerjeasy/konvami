"""`SqlClient` on the RDS Data API: SQL over HTTPS with IAM, so Lambda needs no VPC.

The dev database pauses when idle (Aurora Serverless v2 at zero capacity). The first statement
afterwards is answered with "resuming" for about 15 seconds; this client waits and retries, but
never longer than one API request may take.
"""

import json
import time
from collections.abc import Callable, Mapping
from typing import Any, Protocol

from botocore.exceptions import ClientError

from konvami_api.domain.errors import ServiceUnavailable
from konvami_api.persistence.sql import Param

# Seconds to wait before each retry while the database resumes. The total (20 s) plus the
# statement itself stays under API Gateway's 30-second limit for one request.
RESUME_WAITS: tuple[float, ...] = (1, 2, 2, 3, 3, 3, 3, 3)
_RESUMING = "DatabaseResumingException"


# How soon a caller should try again once the waits have run out.
RETRY_AFTER_SECONDS = 5


class DatabaseWakingUp(ServiceUnavailable):
    """The database was still resuming when the waits ran out. Trying again shortly will work."""

    def __init__(self) -> None:
        super().__init__("waking_up", RETRY_AFTER_SECONDS)


class RdsData(Protocol):
    """The part of boto3's `rds-data` client that is used here."""

    def execute_statement(self, **kwargs: Any) -> dict[str, Any]: ...


def _value(param: Param) -> dict[str, Any]:
    if param is None:
        return {"isNull": True}
    # bool first: in Python a bool is also an int.
    if isinstance(param, bool):
        return {"booleanValue": param}
    if isinstance(param, int):
        return {"longValue": param}
    if isinstance(param, float):
        return {"doubleValue": param}
    return {"stringValue": param}


class DataApiClient:
    def __init__(
        self,
        rds_data: RdsData,
        *,
        cluster_arn: str,
        secret_arn: str,
        database: str,
        sleep: Callable[[float], object] = time.sleep,
    ) -> None:
        self._rds_data = rds_data
        self._target = {"resourceArn": cluster_arn, "secretArn": secret_arn, "database": database}
        self._sleep = sleep

    def execute(self, sql: str, params: Mapping[str, Param] | None = None) -> list[dict[str, Any]]:
        parameters = [
            {"name": name, "value": _value(value)} for name, value in (params or {}).items()
        ]
        waits = iter(RESUME_WAITS)
        while True:
            try:
                response = self._rds_data.execute_statement(
                    **self._target, sql=sql, parameters=parameters, formatRecordsAs="JSON"
                )
            except ClientError as error:
                if error.response.get("Error", {}).get("Code") != _RESUMING:
                    raise
                wait = next(waits, None)
                if wait is None:
                    raise DatabaseWakingUp() from error
                self._sleep(wait)
                continue
            rows: list[dict[str, Any]] = json.loads(response.get("formattedRecords") or "[]")
            return rows
