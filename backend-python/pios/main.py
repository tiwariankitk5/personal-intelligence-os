import asyncio
import logging
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from psycopg import DatabaseError, errors
from psycopg_pool import PoolTimeout
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from . import ai, content, identity, learning, rag, security
from .config import Settings
from .db import migrate, open_pool

log = logging.getLogger("pios")


def create_app(configuration=None):
    @asynccontextmanager
    async def lifespan(app):
        settings = configuration or Settings()
        app.state.settings = settings
        app.state.pool = await run_in_threadpool(open_pool, settings)
        try:
            await run_in_threadpool(migrate, app.state.pool)
            stop = asyncio.Event()
            async def worker():
                while not stop.is_set():
                    try:
                        await asyncio.wait_for(stop.wait(), timeout=settings.worker_delay)
                    except TimeoutError:
                        try:
                            await run_in_threadpool(rag.process_next, app.state.pool, settings)
                        except Exception:
                            log.warning("rag_event=worker_unavailable")
            task = asyncio.create_task(worker()) if settings.worker else None
            async def housekeeping():
                while not stop.is_set():
                    try:
                        await asyncio.wait_for(stop.wait(), timeout=600)
                    except TimeoutError:
                        try:
                            await run_in_threadpool(security.cleanup, app.state.pool)
                        except Exception:
                            log.warning("auth_event=cleanup_unavailable")
            cleanup_task = asyncio.create_task(housekeeping())
            yield
            stop.set()
            if task:
                await task
            await cleanup_task
        finally:
            await run_in_threadpool(app.state.pool.close)

    app = FastAPI(title="PIOS API", version="0.2.0", lifespan=lifespan, docs_url="/docs", redoc_url=None)
    # Settings are validated before starting the listener; no fallback development secrets.
    configuration = configuration or Settings()
    app.add_middleware(security.SessionMiddleware)
    app.add_middleware(CORSMiddleware, allow_origins=configuration.origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                       allow_headers=["Content-Type", "X-CSRF-TOKEN", "Authorization"], expose_headers=["X-Request-ID", "Retry-After"])

    @app.middleware("http")
    async def request_logging(request, call_next):
        start = time.monotonic()
        request_id = str(uuid4())
        try:
            response = await call_next(request)
        except (DatabaseError, PoolTimeout):
            log.error("storage_unavailable request_id=%s", request_id)
            response = JSONResponse({"message": "Storage is temporarily unavailable. Please try again.", "requestId": request_id}, status_code=503)
        except Exception:
            # Never log SQL parameters, document text, passwords, provider keys or bearer tokens.
            log.error("request_failed request_id=%s", request_id)
            response = JSONResponse({"message": "The request could not be completed.", "requestId": request_id}, status_code=500)
        response.headers["X-Request-ID"] = request_id
        log.info("request_id=%s method=%s status=%s elapsed_ms=%d", request_id, request.method, response.status_code, (time.monotonic() - start) * 1000)
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request, ex):
        return JSONResponse({"message": str(ex.detail)}, status_code=ex.status_code, headers=ex.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, ex):
        # Match the frontend's existing 400 contract. Never echo submitted input.
        return JSONResponse({"message": "Invalid request fields.", "fields": [".".join(map(str, e["loc"])) for e in ex.errors()]}, status_code=400)

    @app.exception_handler(errors.UniqueViolation)
    async def duplicate(request, ex):
        return JSONResponse({"message": "This item already exists."}, status_code=409)

    @app.exception_handler(DatabaseError)
    async def database_error(request, ex):
        return JSONResponse({"message": "Storage is temporarily unavailable. Please try again."}, status_code=503)

    @app.get("/actuator/health")
    @app.get("/actuator/health/readiness")
    def health(request: Request):
        with request.app.state.pool.connection() as conn:
            conn.execute("SELECT 1")
        return {"status": "UP"}

    @app.get("/actuator/health/liveness")
    def live():
        return {"status": "UP"}

    for router in (security.router, identity.router, content.router, learning.router, ai.router, rag.router):
        app.include_router(router)
    return app
