from typing import Any

from pydantic import BaseModel, Field


class ErrorEnvelope(BaseModel):
    code: str = Field(default="UNKNOWN_ERROR")
    message: str


class ResponseEnvelope(BaseModel):
    data: Any = None
    error: ErrorEnvelope | None = None
    error_code: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


def ok(data: Any, **meta: Any) -> ResponseEnvelope:
    return ResponseEnvelope(data=data, error=None, meta=meta)


def err(code: str, message: str, **meta: Any) -> ResponseEnvelope:
    return ResponseEnvelope(
        data=None,
        error=ErrorEnvelope(code=code, message=message),
        error_code=code,
        meta=meta,
    )
