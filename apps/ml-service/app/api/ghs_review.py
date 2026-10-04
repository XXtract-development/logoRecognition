"""Authenticated, bounded raw-body entry point for stateless GHS prelabels."""

import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.ghs_review import (
    BODY_LIMIT,
    DEADLINE_SECONDS,
    ReviewError,
    ReviewInput,
    admission,
    authorize,
    review,
)

router = APIRouter()


@router.post("/ghs/review")
async def ghs_review(request: Request):
    try:
        authorize(request.headers.get("x-ghs-review-key"))
        with admission():
            deadline = asyncio.get_running_loop().time() + DEADLINE_SECONDS

            async def read_body():
                body = bytearray()
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > BODY_LIMIT:
                        raise ReviewError(413, "BODY_TOO_LARGE")
                return body

            body = await asyncio.wait_for(read_body(), timeout=DEADLINE_SECONDS)
            try:
                payload = ReviewInput.model_validate(json.loads(body))
            except (ValueError, ValidationError, RecursionError):
                raise ReviewError(422, "INVALID_REVIEW_INPUT") from None
            return await review(payload, deadline=deadline, admitted=True)
    except asyncio.TimeoutError:
        return JSONResponse(
            status_code=504, content={"error": {"code": "GHS_REVIEW_TIMEOUT"}}
        )
    except ReviewError as error:
        return JSONResponse(
            status_code=error.status, content={"error": {"code": error.code}}
        )
