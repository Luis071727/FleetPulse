import logging

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.actions.routes import router as actions_router
from app.ai.routes import router as ai_router
from app.auth.routes import router as auth_router
from app.carrier_compliance.routes import router as carrier_compliance_router
from app.carriers.routes import router as carrier_router
from app.common.schemas import ResponseEnvelope
from app.config import settings
from app.feedback.routes import router as feedback_router
from app.invoices.routes import router as invoice_router
from app.insurance.routes import router as insurance_router
from app.loads.routes import router as load_router
from app.paperwork.routes import router as paperwork_router

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"data": None, "error": str(exc), "error_code": "INTERNAL_ERROR", "meta": {}},
    )


api_v1 = APIRouter(prefix="/api/v1")


@app.get("/")
def root():
    return RedirectResponse(url="/api/v1/health")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@api_v1.get("/health")
def health_v1() -> ResponseEnvelope:
    return ResponseEnvelope(data={"status": "ok"}, error=None, meta={"version": "v1"})


api_v1.include_router(actions_router)
api_v1.include_router(auth_router)
api_v1.include_router(carrier_router)
api_v1.include_router(carrier_compliance_router)
api_v1.include_router(load_router)
api_v1.include_router(invoice_router)
api_v1.include_router(ai_router)
api_v1.include_router(insurance_router)
api_v1.include_router(feedback_router)
api_v1.include_router(paperwork_router)
app.include_router(api_v1)
