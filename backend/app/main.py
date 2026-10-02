"""Main FastAPI application entrypoint for PotatoClaw Backend."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import sentry_sdk

from app.api.v1.endpoints import health
from app.api.v1.router import api_router
from app.core.config import settings
from app.services.sentry_tracing import init_sentry

# Initialize Sentry before creating the FastAPI instance
init_sentry()

app = FastAPI(
    title="PotatoClaw Backend",
    description="Anti-thrash AI companion backend for 8GB RAM Windows laptops.",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global unhandled exception handler with Sentry capture
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    sentry_sdk.capture_exception(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"},
    )

# Include health router at root
app.include_router(health.router)

# Include versioned API router
app.include_router(api_router, prefix="/api/v1")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
