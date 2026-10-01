from __future__ import annotations


class Fault(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status: int = 502,
        *,
        retryable: bool = False,
        upstream_status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable
        self.upstream_status = upstream_status
