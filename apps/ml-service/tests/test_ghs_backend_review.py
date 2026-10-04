"""HTTP-mocked contract tests; do not constitute live provider quality evidence."""

import asyncio
import base64
import hashlib
import importlib
import io
import json
import os
import subprocess
import sys
import textwrap
import threading
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from PIL import Image
from pydantic import SecretStr

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def runtime(monkeypatch):
    for name in ["app.ghs_review", "app.api.ghs_review"]:
        monkeypatch.delitem(sys.modules, name, raising=False)
    service = importlib.import_module("app.ghs_review")
    route = importlib.import_module("app.api.ghs_review")
    monkeypatch.setattr(
        service.settings, "GHS_REVIEW_INTERNAL_KEY", SecretStr("i" * 32)
    )
    monkeypatch.setattr(service.settings, "PIPELINE_SERVICE_KEY", SecretStr(""))
    monkeypatch.setattr(
        service.settings, "GHS_REVIEW_BASE_URL", "https://mock.example/v1"
    )
    monkeypatch.setattr(
        service.settings, "GHS_REVIEW_API_KEY", SecretStr("secret-provider")
    )
    monkeypatch.setattr(service.settings, "GHS_REVIEW_MODEL_A", "vision-a")
    monkeypatch.setattr(service.settings, "GHS_REVIEW_MODEL_B", "vision-b")
    monkeypatch.setattr(service, "_active_requests", 0)
    app = FastAPI()
    app.include_router(route.router, prefix="/ml")
    return service, app


def image_payload(format="PNG"):
    stream = io.BytesIO()
    Image.new("RGB", (20, 15), "white").save(stream, format)
    return {
        "image": base64.b64encode(stream.getvalue()).decode(),
        "mimeType": "image/png" if format == "PNG" else "image/jpeg",
    }


def envelope(output=None, model="actual-model", **choice):
    return {
        "model": model,
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": json.dumps(output if output is not None else visual())
                },
                **choice,
            }
        ],
    }


def visual(annotations=None, **changes):
    return {
        "pageType": "label",
        "readability": "readable",
        "annotations": annotations or [],
        **changes,
    }


def annotation(**changes):
    return {
        "code": "FLAME",
        "box_2d": [100, 200, 400, 600],
        "confidence": 0.9,
        "uncertain": False,
        **changes,
    }


def provider_mock(monkeypatch, service, handler):
    original = httpx.AsyncClient
    monkeypatch.setattr(
        service.httpx,
        "AsyncClient",
        lambda **kw: original(transport=httpx.MockTransport(handler), **kw),
    )


@pytest.mark.asyncio
async def test_identical_original_bytes_two_isolated_calls(runtime, monkeypatch):
    service, _ = runtime
    calls = []
    output = visual([annotation()])

    def handler(request):
        calls.append(json.loads(request.content))
        assert request.headers["authorization"] == "Bearer secret-provider"
        return httpx.Response(
            200, json=envelope(output, model="returned-" + calls[-1]["model"])
        )

    provider_mock(monkeypatch, service, handler)
    payload = image_payload()
    result = await service.review(service.ReviewInput(**payload))
    assert len(calls) == 2
    assert calls[0]["messages"] == calls[1]["messages"]
    for call in calls:
        url = call["messages"][1]["content"][0]["image_url"]["url"]
        assert base64.b64decode(url.split(",")[1]) == base64.b64decode(payload["image"])
        assert len(call["messages"]) == 2
    assert (
        result["image"]["sha256"]
        == hashlib.sha256(base64.b64decode(payload["image"])).hexdigest()
    )
    assert result["image"]["width"] == 20 and result["image"]["height"] == 15
    assert result["reviews"][0]["reviewId"] != result["reviews"][1]["reviewId"]
    assert result["reviews"][0]["output"] == output
    assert result["reviews"][0]["projectedAnnotations"][0]["bbox"] == {
        "x": 4,
        "y": 1.5,
        "width": 8,
        "height": 4.5,
    }
    assert result["reviews"][0]["returnedModel"] == "returned-vision-a"
    assert result["comparison"]["status"] == "agree"
    assert result["humanReviewRequired"] is True
    assert result["independentErrorsGuaranteed"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad",
    [
        visual([annotation(code="GHS02")]),
        visual([annotation(code="UNKNOWN")]),
        visual([annotation(box_2d=[0, 900, 100, 1001])]),
        visual([annotation(confidence=float("nan"))]),
        visual([annotation(extra="bad")]),
    ],
)
async def test_partial_preserves_good_output(runtime, monkeypatch, bad):
    service, _ = runtime
    good = visual([annotation()])
    provider_mock(
        monkeypatch,
        service,
        lambda request: httpx.Response(
            200,
            json=envelope(
                good if json.loads(request.content)["model"] == "vision-a" else bad
            ),
        ),
    )
    result = await service.review(service.ReviewInput(**image_payload()))
    assert result["status"] == "partial"
    assert result["reviews"][0]["output"] == good
    assert result["reviews"][1]["status"] == "failed"
    assert result["comparison"]["status"] == "incomplete"


@pytest.mark.asyncio
async def test_disagreement_and_empty_remain_prelabels(runtime, monkeypatch):
    service, _ = runtime
    monkeypatch.setattr(service.settings, "GHS_REVIEW_MODEL_B", "vision-a")
    provider_mock(
        monkeypatch, service, lambda request: httpx.Response(200, json=envelope())
    )
    result = await service.review(service.ReviewInput(**image_payload()))
    assert result["sameConfiguredModel"] and result["sameReturnedModel"]
    assert result["comparison"]["status"] == "agree" and result["humanReviewRequired"]
    assert (
        service.compare(
            [
                {"status": "succeeded", "output": visual()},
                {"status": "succeeded", "output": visual([annotation()])},
            ]
        )["status"]
        == "disagree"
    )


@pytest.mark.asyncio
async def test_auth_schema_and_chunked_body_no_provider(runtime, monkeypatch):
    service, app = runtime
    calls = []
    original = httpx.AsyncClient
    provider_mock(monkeypatch, service, lambda request: calls.append(request))
    async with original(
        transport=httpx.ASGITransport(app=app), base_url="http://local"
    ) as client:
        response = await client.post("/ml/ghs/review", content="secret-image")
        assert response.status_code == 401 and "secret-image" not in response.text
        response = await client.post(
            "/ml/ghs/review",
            json={"image": "secret-image", "mimeType": "x"},
            headers={"x-ghs-review-key": "i" * 32},
        )
        assert response.status_code == 422 and "secret-image" not in response.text

        async def chunks():
            for _ in range(7):
                yield b"x" * (1024 * 1024)

        response = await client.post(
            "/ml/ghs/review",
            content=chunks(),
            headers={"x-ghs-review-key": "i" * 32, "content-length": "1"},
        )
        assert response.status_code == 413
    assert calls == []


@pytest.mark.parametrize(
    "change,status",
    [
        ({"image": "not-base64"}, 422),
        ({"image": base64.b64encode(b"broken").decode()}, 422),
        ({"mimeType": "image/jpeg"}, 422),
        ({"image": base64.b64encode(b"x" * (4 * 1024 * 1024 + 1)).decode()}, 413),
    ],
)
def test_invalid_image(runtime, change, status):
    service, _ = runtime
    with pytest.raises(service.ReviewError) as error:
        service.validate_image(service.ReviewInput(**{**image_payload(), **change}))
    assert error.value.status == status


def test_pixels_frames_and_jpeg(runtime):
    service, _ = runtime
    assert service.validate_image(service.ReviewInput(**image_payload("JPEG")))[1:] == (
        20,
        15,
    )
    stream = io.BytesIO()
    first = Image.new("RGB", (2, 2), "white")
    first.save(
        stream, "PNG", save_all=True, append_images=[Image.new("RGB", (2, 2), "black")]
    )
    with pytest.raises(service.ReviewError) as error:
        service.validate_image(
            service.ReviewInput(
                image=base64.b64encode(stream.getvalue()).decode(), mimeType="image/png"
            )
        )
    assert error.value.status == 422
    stream = io.BytesIO()
    Image.new("1", (5000, 5000)).save(stream, "PNG")
    with pytest.raises(service.ReviewError) as error:
        service.validate_image(
            service.ReviewInput(
                image=base64.b64encode(stream.getvalue()).decode(), mimeType="image/png"
            )
        )
    assert error.value.status == 413


@pytest.mark.asyncio
async def test_configuration_and_capacity_no_calls(runtime, monkeypatch):
    service, _ = runtime
    payload = service.ReviewInput(**image_payload())
    monkeypatch.setattr(service.settings, "GHS_REVIEW_MODEL_B", "")
    with pytest.raises(service.ReviewError) as error:
        await service.review(payload)
    assert error.value.status == 503
    monkeypatch.setattr(service.settings, "GHS_REVIEW_MODEL_B", "vision-b")
    monkeypatch.setattr(service, "_active_requests", 2)
    with pytest.raises(service.ReviewError) as error:
        await service.review(payload)
    assert error.value.status == 429


@pytest.mark.asyncio
async def test_deadline_retains_first_and_releases_capacity(runtime, monkeypatch):
    service, _ = runtime
    monkeypatch.setattr(service, "DEADLINE_SECONDS", 0.1)

    async def handler(request):
        if json.loads(request.content)["model"] == "vision-b":
            await asyncio.sleep(1)
        return httpx.Response(200, json=envelope())

    provider_mock(monkeypatch, service, handler)
    result = await service.review(service.ReviewInput(**image_payload()))
    assert result["status"] == "partial"
    assert result["reviews"][1]["error"]["code"] == "PROVIDER_TIMEOUT"
    assert service._active_requests == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("timeout", [False, True])
async def test_both_fail_sanitized(runtime, monkeypatch, timeout):
    service, _ = runtime

    def handler(request):
        if timeout:
            raise httpx.ReadTimeout("secret-image secret-provider", request=request)
        return httpx.Response(401, text="secret-image secret-provider")

    provider_mock(monkeypatch, service, handler)
    with pytest.raises(service.ReviewError) as error:
        await service.review(service.ReviewInput(**image_payload()))
    assert error.value.status == (504 if timeout else 502)
    assert "secret" not in str(error.value)
    assert service._active_requests == 0


@pytest.mark.parametrize(
    "choice",
    [
        {"finish_reason": "length"},
        {"message": {"content": "broken-json"}},
        {"message": {"content": '{"annotations":[],"annotations":[]}'}},
        {"message": {"content": '{"annotations":[]}', "refusal": "blocked"}},
    ],
)
def test_invalid_provider_envelopes(runtime, choice):
    service, _ = runtime
    with pytest.raises((ValueError, KeyError)):
        service.parse_output(envelope(**choice), 20, 15)


def test_internal_configuration_fail_closed_and_fallback(runtime, monkeypatch):
    service, _ = runtime
    monkeypatch.setattr(service.settings, "GHS_REVIEW_INTERNAL_KEY", SecretStr(""))
    with pytest.raises(service.ReviewError) as error:
        service.authorize("i" * 32)
    assert error.value.status == 503
    monkeypatch.setattr(service.settings, "PIPELINE_SERVICE_KEY", SecretStr("p" * 32))
    service.authorize("p" * 32)
    with pytest.raises(service.ReviewError):
        service.authorize("bad")


@pytest.mark.asyncio
async def test_route_capacity_covers_body_reads_and_body_deadline(runtime, monkeypatch):
    service, app = runtime
    route = importlib.import_module("app.api.ghs_review")
    original = httpx.AsyncClient
    monkeypatch.setattr(service, "_active_requests", 2)
    async with original(
        transport=httpx.ASGITransport(app=app), base_url="http://local"
    ) as client:
        response = await client.post(
            "/ml/ghs/review",
            content=b"not-read",
            headers={"x-ghs-review-key": "i" * 32},
        )
        assert response.status_code == 429
        monkeypatch.setattr(service, "_active_requests", 0)
        monkeypatch.setattr(route, "DEADLINE_SECONDS", 0.02)

        async def slow_body():
            await asyncio.sleep(1)
            yield b"{}"

        response = await client.post(
            "/ml/ghs/review",
            content=slow_body(),
            headers={"x-ghs-review-key": "i" * 32},
        )
        assert response.status_code == 504
        assert service._active_requests == 0


def test_real_import_has_no_training_database_or_storage_side_effects():
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; import app.api.ghs_review; assert not any(name == 'app.services' or name.startswith('app.services.') for name in sys.modules); assert 'app.ml.model_manager' not in sys.modules",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.asyncio
@pytest.mark.parametrize("partial", [False, True])
async def test_asgi_success_and_partial_use_real_service(runtime, monkeypatch, partial):
    service, app = runtime
    original = httpx.AsyncClient
    good = visual([annotation()])
    calls = []

    def handler(request):
        calls.append(json.loads(request.content))
        if partial and calls[-1]["model"] == "vision-b":
            return httpx.Response(
                200, json={"model": "actual-model", "choices": [None]}
            )
        return httpx.Response(200, json=envelope(good))

    provider_mock(monkeypatch, service, handler)
    async with original(
        transport=httpx.ASGITransport(app=app), base_url="http://local"
    ) as client:
        response = await client.post(
            "/ml/ghs/review",
            json=image_payload(),
            headers={"x-ghs-review-key": "i" * 32},
        )
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == ("partial" if partial else "ai-reviewed")
    assert result["reviews"][0]["output"] == good
    assert result["reviews"][0]["projectedAnnotations"][0]["bbox"]["x"] == 4
    assert result["reviews"][1]["status"] == ("failed" if partial else "succeeded")
    assert result["comparison"]["status"] == ("incomplete" if partial else "agree")
    assert len(calls) == 2 and service._active_requests == 0
    assert not service._validation_jobs
    assert result["humanReviewRequired"]


def compared(service, a, b):
    return service.compare(
        [{"status": "succeeded", "output": a}, {"status": "succeeded", "output": b}]
    )


@pytest.mark.parametrize(
    "change,labels,locations,uncertainty",
    [
        ({"code": "CORROSION"}, "disagree", "disagree", "disagree"),
        ({"box_2d": [600, 600, 900, 900]}, "agree", "disagree", "agree"),
        ({"confidence": 0.8}, "agree", "agree", "agree"),
        ({"uncertain": True}, "agree", "agree", "disagree"),
    ],
)
def test_comparison_separates_same_count_differences(
    runtime, change, labels, locations, uncertainty
):
    service, _ = runtime
    result = compared(service, visual([annotation()]), visual([annotation(**change)]))
    assert result["status"] == "disagree"
    assert result["labels"]["status"] == labels
    assert result["locations"]["status"] == locations
    assert result["uncertainty"]["status"] == uncertainty


def test_repeated_codes_reversed_order_numeric_semantics_and_page_assessment(runtime):
    service, _ = runtime
    a = annotation(confidence=1, box_2d=[1, 1, 100, 100])
    b = annotation(confidence=1.0, box_2d=[1.0, 1.0, 100.0, 100.0])
    other = annotation(box_2d=[800, 800, 900, 900])
    result = compared(service, visual([a, other]), visual([other, b]))
    assert result["status"] == "agree"
    assert result["labels"]["codeCounts"] == [{"FLAME": 2}, {"FLAME": 2}]
    assert result["locations"]["matches"] == [
        {"aIndex": 0, "bIndex": 1, "iou": 1.0},
        {"aIndex": 1, "bIndex": 0, "iou": 1.0},
    ]
    assert (
        compared(service, visual(), visual(pageType="technical"))["status"]
        == "disagree"
    )
    assert (
        compared(service, visual(), visual(readability="unreadable"))["pageAssessment"][
            "status"
        ]
        == "disagree"
    )
    # A single symbol in B must never be counted twice against two copies in A.
    result = compared(service, visual([a, a]), visual([b]))
    assert (
        len(result["locations"]["matches"]) == 1
        and result["locations"]["status"] == "disagree"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad",
    [
        {"model": "actual-model", "choices": [None]},
        {
            "model": "actual-model",
            "choices": [{"finish_reason": "stop", "message": None}],
        },
        {"model": "actual-model", "choices": None},
        None,
        {
            "model": "actual-model",
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"content": "[" * 2000 + "]" * 2000},
                }
            ],
        },
    ],
)
async def test_malformed_envelopes_keep_successful_sibling(runtime, monkeypatch, bad):
    service, _ = runtime
    provider_mock(
        monkeypatch,
        service,
        lambda request: httpx.Response(
            200,
            json=(
                envelope()
                if json.loads(request.content)["model"] == "vision-a"
                else bad
            ),
        ),
    )
    result = await service.review(service.ReviewInput(**image_payload()))
    assert result["status"] == "partial"
    assert result["reviews"][0]["status"] == "succeeded"
    assert result["reviews"][1]["error"]["code"] == "INVALID_PROVIDER_OUTPUT"


@pytest.mark.asyncio
async def test_deep_request_json_sanitized(runtime):
    service, app = runtime
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://local"
    ) as client:
        response = await client.post(
            "/ml/ghs/review",
            content="[" * 2000 + '"secret-image"' + "]" * 2000,
            headers={"x-ghs-review-key": "i" * 32},
        )
    assert response.status_code == 422 and "secret-image" not in response.text
    assert service._active_requests == 0


def test_invalid_provider_url_is_configuration_error(runtime, monkeypatch):
    service, _ = runtime
    monkeypatch.setattr(service.settings, "GHS_REVIEW_BASE_URL", "https://[malformed")
    with pytest.raises(service.ReviewError) as error:
        service.provider_config()
    assert error.value.status == 503


@pytest.mark.parametrize("format,mime", [("JPEG", "image/jpeg"), ("PNG", "image/png")])
@pytest.mark.parametrize("orientation", [2, 6, 8])
def test_exif_orientation_rejected_without_reencoding(
    runtime, format, mime, orientation
):
    service, _ = runtime
    stream = io.BytesIO()
    image = Image.new("RGB", (20, 15), "white")
    exif = Image.Exif()
    exif[274] = orientation
    image.save(stream, format, exif=exif)
    with pytest.raises(service.ReviewError) as error:
        service.validate_image(
            service.ReviewInput(
                image=base64.b64encode(stream.getvalue()).decode(), mimeType=mime
            )
        )
    assert error.value.status == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel", [False, True])
async def test_validation_threads_retain_capacity_until_done(
    runtime, monkeypatch, cancel
):
    service, _ = runtime
    release = threading.Event()
    started = [threading.Event(), threading.Event()]
    lock = threading.Lock()
    count = 0
    validate = service.validate_image

    def blocked(payload):
        nonlocal count
        with lock:
            index = count
            count += 1
        started[index].set()
        release.wait(2)
        return validate(payload)

    monkeypatch.setattr(service, "validate_image", blocked)
    monkeypatch.setattr(service, "DEADLINE_SECONDS", 0.04)
    payload = service.ReviewInput(**image_payload())
    requests = [asyncio.create_task(service.review(payload)) for _ in range(2)]
    try:
        for _ in range(100):
            if all(item.is_set() for item in started):
                break
            await asyncio.sleep(0.002)
        assert all(item.is_set() for item in started)
        if cancel:
            for request in requests:
                request.cancel()
        results = await asyncio.gather(*requests, return_exceptions=True)
        assert all(
            isinstance(item, asyncio.CancelledError if cancel else service.ReviewError)
            for item in results
        )
        assert len(service._validation_jobs) == 2 and service._active_requests == 0
        with pytest.raises(service.ReviewError) as error:
            await service.review(payload)
        assert error.value.status == 429
    finally:
        release.set()
        await asyncio.gather(*list(service._validation_jobs), return_exceptions=True)
        await asyncio.sleep(0)
    assert not service._validation_jobs


@pytest.mark.parametrize(
    "box",
    [
        [-1, 0, 100, 100],
        [0, 0, 1001, 100],
        [100, 0, 100, 100],
        [0, 100, 100, 50],
        [0, 0, 100],
        [0, 0, 100, float("inf")],
        [0, 0, "100", 100],
        [False, 0, 100, 100],
    ],
)
def test_normalized_box_contract_is_strict(runtime, box):
    service, _ = runtime
    with pytest.raises(ValueError):
        service.parse_output(envelope(visual([annotation(box_2d=box)])), 20, 15)


def test_unknown_is_only_an_uncertain_visual_annotation(runtime):
    service, _ = runtime
    output = visual(
        [annotation(code="UNKNOWN", uncertain=True)],
        pageType="other",
        readability="uncertain",
    )
    _, raw = service.parse_output(envelope(output), 20, 15)
    assert raw == output
    assert service.project_annotations(raw, 20, 15)[0]["uncertain"] is True


@pytest.mark.parametrize(
    "shift,expected,status",
    [
        (20, 7 / 11, "agree"),
        (30, 0.5, "agree"),
        (40, 5 / 13, "disagree"),
    ],
)
def test_location_iou_values_and_inclusive_half_threshold(
    runtime, shift, expected, status
):
    service, _ = runtime
    left = annotation(box_2d=[0, 0, 90, 100])
    right = annotation(box_2d=[shift, 0, 90 + shift, 100])
    assert service.box_iou(left, right) == pytest.approx(expected)
    result = compared(service, visual([left]), visual([right]))
    assert result["locations"]["status"] == status
    if status == "agree":
        assert result["locations"]["matches"][0]["iou"] == pytest.approx(expected)
    else:
        assert result["locations"]["matches"] == []


def test_distinct_location_swapped_flags_disagree_even_with_same_flag_counts(runtime):
    service, _ = runtime
    left = annotation(box_2d=[0, 0, 100, 100], uncertain=False)
    right = annotation(box_2d=[500, 500, 600, 600], uncertain=True)
    a = visual([left, right])
    b = visual([{**left, "uncertain": True}, {**right, "uncertain": False}])
    result = compared(service, a, b)
    assert result["labels"]["status"] == "agree"
    assert result["locations"]["status"] == "agree"
    assert result["uncertainty"]["status"] == "disagree"
    assert result["status"] == "disagree"


def test_identical_coincident_repeated_flags_have_compatible_matching(runtime):
    service, _ = runtime
    a = visual([annotation(uncertain=False), annotation(uncertain=True)])
    b = visual(list(reversed(a["annotations"])))
    for output in [a, b]:
        result = compared(service, a, output)
        assert result["status"] == "agree"
        assert result["locations"]["status"] == "agree"
        assert result["uncertainty"]["status"] == "agree"


@pytest.mark.asyncio
async def test_tiny_normalized_boxes_keep_both_successes(runtime, monkeypatch):
    service, _ = runtime
    tiny = annotation(box_2d=[0, 0, 1e-200, 1e-200])
    assert service.box_iou(tiny, tiny) == 1
    near = annotation(box_2d=[0, 0, 2e-200, 1e-200])
    assert service.box_iou(tiny, near) == pytest.approx(0.5)
    disjoint = annotation(box_2d=[2e-200, 0, 3e-200, 1e-200])
    assert service.box_iou(tiny, disjoint) == 0
    provider_mock(
        monkeypatch,
        service,
        lambda request: httpx.Response(200, json=envelope(visual([tiny]))),
    )
    result = await service.review(service.ReviewInput(**image_payload()))
    assert result["status"] == "ai-reviewed" and result["humanReviewRequired"]
    assert result["comparison"]["status"] == "agree"
    assert all(item["status"] == "succeeded" for item in result["reviews"])
    assert result["reviews"][0]["output"]["annotations"][0] == tiny


@pytest.mark.parametrize(
    "url", ["https://mock.example:invalid/v1", "https://mock.example:65536/v1"]
)
@pytest.mark.asyncio
async def test_invalid_port_config_is_sanitized_before_provider(
    runtime, monkeypatch, url
):
    service, _ = runtime
    calls = []
    monkeypatch.setattr(service.settings, "GHS_REVIEW_BASE_URL", url)
    provider_mock(monkeypatch, service, lambda request: calls.append(request))
    with pytest.raises(service.ReviewError) as error:
        await service.review(service.ReviewInput(**image_payload()))
    assert error.value.status == 503
    assert error.value.code == "GHS_REVIEW_PROVIDER_UNAVAILABLE"
    assert calls == [] and service._active_requests == 0


def test_normalized_prompt_omits_original_pixel_dimension_frame(runtime):
    service, _ = runtime
    text = service.instructions(1754, 1396)
    assert "1754" not in text and "1396" not in text
    assert "normalized to 0..1000" in text
    assert "[ymin,xmin,ymax,xmax]" in text


def test_successful_and_empty_real_route_forbid_persistence_training_and_network():
    script = textwrap.dedent(
        """
        import asyncio, base64, builtins, io, json, os, socket, sys
        from pathlib import Path
        import httpx
        from fastapi import FastAPI
        from PIL import Image
        from pydantic import SecretStr

        stream = io.BytesIO()
        Image.new('RGB', (20, 15), 'white').save(stream, 'PNG')
        payload = {'image': base64.b64encode(stream.getvalue()).decode(), 'mimeType': 'image/png'}
        def forbidden(*args, **kwargs):
            raise AssertionError('Forbidden persistence or external network operation')
        original_open, original_io_open, original_os_open = builtins.open, io.open, os.open
        def checked_open(original, file, mode='r', *args, **kwargs):
            if any(flag in mode for flag in 'wax+'):
                forbidden()
            return original(file, mode, *args, **kwargs)
        builtins.open = lambda file, mode='r', *args, **kwargs: checked_open(original_open, file, mode, *args, **kwargs)
        io.open = lambda file, mode='r', *args, **kwargs: checked_open(original_io_open, file, mode, *args, **kwargs)
        def checked_os_open(path, flags, *args, **kwargs):
            if flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND):
                forbidden()
            return original_os_open(path, flags, *args, **kwargs)
        os.open = checked_os_open
        Path.mkdir = forbidden
        Path.write_text = forbidden
        Path.write_bytes = forbidden
        os.mkdir = forbidden
        socket.socket.connect = forbidden
        socket.socket.connect_ex = forbidden
        socket.create_connection = forbidden

        from app.api.ghs_review import router
        from app.core.config import settings
        import app.ghs_review as service
        settings.GHS_REVIEW_INTERNAL_KEY = SecretStr('i' * 32)
        settings.GHS_REVIEW_API_KEY = SecretStr('provider-secret')
        settings.GHS_REVIEW_BASE_URL = 'https://mock.example/v1'
        settings.GHS_REVIEW_MODEL_A = 'vision-a'
        settings.GHS_REVIEW_MODEL_B = 'vision-b'
        app = FastAPI()
        app.include_router(router, prefix='/ml')
        original_client = httpx.AsyncClient
        calls = []
        current_annotations = []
        def provider(request):
            calls.append(json.loads(request.content))
            output = {'pageType':'label', 'readability':'readable', 'annotations':current_annotations}
            return httpx.Response(200, json={'model':'actual-model', 'choices':[{'finish_reason':'stop', 'message':{'content':json.dumps(output)}}]})
        service.httpx.AsyncClient = lambda **kwargs: original_client(transport=httpx.MockTransport(provider), **kwargs)
        async def run():
            global current_annotations
            async with original_client(transport=httpx.ASGITransport(app=app), base_url='http://local') as client:
                for annotations in [[{'code':'FLAME','box_2d':[100,200,400,600],'confidence':0.9,'uncertain':False}], []]:
                    current_annotations = annotations
                    before = len(calls)
                    response = await client.post('/ml/ghs/review', json=payload, headers={'x-ghs-review-key':'i'*32})
                    assert response.status_code == 200
                    result = response.json()
                    assert result['humanReviewRequired'] is True and result['labelType'] == 'ai-prelabel'
                    assert result['status'] == 'ai-reviewed' and result['comparison']['status'] == 'agree'
                    assert all(review['output']['annotations'] == annotations for review in result['reviews'])
                    assert len(calls) - before == 2
                    assert service._active_requests == 0 and not service._validation_jobs
                    assert not any(name == 'app.services' or name.startswith('app.services.') for name in sys.modules)
                    assert 'app.ml.model_manager' not in sys.modules
            assert len(calls) == 4
        asyncio.run(run())
    """
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=ROOT,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert result.returncode == 0, result.stderr
