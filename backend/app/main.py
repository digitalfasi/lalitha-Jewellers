from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app._shared.core.config import settings
from app._shared.core.database import engine
from app._shared.core.uploads import upload_root
from app._shared.exceptions.base import AppException
from app.api.v1.router import api_router

settings.validate_production_safety()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {"code": exc.code, "message": exc.message, "field": getattr(exc, "field", None)},
        },
    )


@app.exception_handler(RequestValidationError)
async def request_validation_handler(request: Request, exc: RequestValidationError):
    # Same shape as AppException, so the web app reads one error format.
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", ())[1:]) or None
    message = first.get("msg", "Invalid request")
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {"code": "VALIDATION_ERROR", "message": f"{field}: {message}" if field else message, "field": field},
        },
    )


app.include_router(api_router, prefix=settings.API_V1_PREFIX)

# Piece / combo photos and the logo. Names are random, so a link can't be guessed.
app.mount("/uploads", StaticFiles(directory=str(upload_root())), name="uploads")
