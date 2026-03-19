from fastapi import APIRouter
from pydantic import BaseModel

from app.common.schemas import ErrorEnvelope, ResponseEnvelope
from app.insurance.service import InsuranceService


router = APIRouter(prefix="/insurance", tags=["insurance"])
service = InsuranceService()


class DataQsIn(BaseModel):
    carrier_id: str
    event_id: str


class MvrIn(BaseModel):
    carrier_id: str
    consent: bool


@router.post("/mvr")
def pull_mvr(payload: MvrIn) -> ResponseEnvelope:
    try:
        result = service.request_mvr(carrier_id=payload.carrier_id, consent=payload.consent)
        return ResponseEnvelope(data=result, error=None, meta={})
    except PermissionError as ex:
        return ResponseEnvelope(
            data=None,
            error=ErrorEnvelope(code="consent_required", message=str(ex)),
            meta={},
        )


@router.post("/datqs/challenge")
def generate_dataqs_challenge(payload: DataQsIn) -> ResponseEnvelope:
    challenge = service.build_dataqs_challenge(carrier_id=payload.carrier_id, event_id=payload.event_id)
    return ResponseEnvelope(data=challenge, error=None, meta={})
