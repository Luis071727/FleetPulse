from dataclasses import dataclass


@dataclass
class InsuranceScore:
    carrier_id: str
    irs_score: int
    renewal_risk: str


class InsuranceService:
    def __init__(self) -> None:
        self._scores: dict[str, InsuranceScore] = {
            "carrier-1": InsuranceScore(carrier_id="carrier-1", irs_score=61, renewal_risk="high"),
            "carrier-2": InsuranceScore(carrier_id="carrier-2", irs_score=78, renewal_risk="medium"),
        }

    def list_scores(self) -> list[dict]:
        return [vars(score) for score in self._scores.values()]

    def recompute_irs(self, carrier_id: str) -> dict:
        score = self._scores.get(carrier_id)
        if not score:
            score = InsuranceScore(carrier_id=carrier_id, irs_score=70, renewal_risk="medium")
            self._scores[carrier_id] = score
        return vars(score)

    def request_mvr(self, carrier_id: str, consent: bool) -> dict:
        if not consent:
            raise PermissionError("MVR consent is required")
        return {"carrier_id": carrier_id, "mvr_status": "retrieved"}

    def build_playbook(self, carrier_id: str) -> dict:
        score = self.recompute_irs(carrier_id)
        actions = [
            {"rank": 1, "action": "Resolve open CSA alerts", "confidence": 0.86},
            {"rank": 2, "action": "Collect missing maintenance records", "confidence": 0.72},
        ]
        return {"carrier_id": carrier_id, "irs_score": score["irs_score"], "actions": actions}

    def build_dataqs_challenge(self, carrier_id: str, event_id: str) -> dict:
        return {
            "carrier_id": carrier_id,
            "event_id": event_id,
            "eligible": True,
            "confidence": 0.81,
            "letter": f"Carrier {carrier_id} requests DataQs review for event {event_id}.",
        }
