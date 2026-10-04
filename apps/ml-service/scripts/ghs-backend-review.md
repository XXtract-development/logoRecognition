# Stateless backend GHS visual reviews

Configure these **on the ML service** (no provider or model defaults):

- `GHS_REVIEW_BASE_URL`: OpenAI-compatible API base URL, including `/v1` where required. The service appends `/chat/completions`. Redirects are disabled.
- `GHS_REVIEW_API_KEY`: provider secret.
- `GHS_REVIEW_MODEL_A` and `GHS_REVIEW_MODEL_B`: exact vision-capable model identifiers. The same model is permitted and reported explicitly.
- `GHS_REVIEW_INTERNAL_KEY`: optional shared random secret, also configured on the gateway (minimum 32 characters). If absent, both services use their existing `PIPELINE_SERVICE_KEY`; that must also have at least 32 characters. Generate with `openssl rand -hex 32`.

Configure `ML_SERVICE_URL` and `PIPELINE_SERVICE_KEY` on the gateway. The public route accepts that service key via `x-api-key`, or an authenticated ADMIN JWT via Bearer/cookie. An incorrect supplied service key never falls back to JWT. Provider credentials stay on ML.

## Call recipe

Create request JSON from the original PNG/JPEG (no resizing or re-encoding):

```python
import base64, json
from pathlib import Path
image = Path('original.png')
Path('request.json').write_text(json.dumps({
    'image': base64.b64encode(image.read_bytes()).decode('ascii'),
    'mimeType': 'image/png',  # use image/jpeg for JPEG
}))
```

```sh
curl --max-time 110 --request POST "$API_URL/api/v1/ghs/review" \
  --header "x-api-key: $PIPELINE_SERVICE_KEY" \
  --header 'Content-Type: application/json' \
  --data-binary @request.json
```

Do not commit request images, JSON payloads, or secrets. The internal route is `/ml/ghs/review`, authenticated with `x-ghs-review-key` before reading the body. There is no URL download, detector input, free prompt, persistence, training, or automatic acceptance.

Limits: 6 MiB body, 4 MiB decoded bytes, 24 million pixels, single-frame PNG/JPEG with absent/normal (1) EXIF orientation; two concurrent requests per ML worker; at most two active image-validation jobs even after request cancellation or timeout; ML review deadline 90 seconds (gateway transport timeout 105 seconds to allow a partial answer). Both HTTP calls receive identical original image bytes and fixed instructions; neither receives the other's output.

## Response contract

Success returns `status:ai-reviewed`, or `partial` if only one review succeeds; `labelType:ai-prelabel` and `humanReviewRequired:true` always remain. Image provenance includes raw-byte SHA256, original dimensions, MIME type and byte length. Each review has a separate UUID, configured model, succeeded/failed status and, on success, actual returned model and unmodified validated `output.annotations`.

Raw output has required `pageType` (`label`, `technical`, `other`), `readability` (`readable`, `uncertain`, `unreadable`) and `annotations`. Each annotation contains `code`, `box_2d`, `confidence`, `uncertain`. Codes use one of the nine canonical names from `app/symbol_contract.py` (not GHS01 aliases), or `UNKNOWN` with `uncertain:true`. `box_2d` is exactly `[ymin,xmin,ymax,xmax]`, finite normalized coordinates in 0..1000 relative to the complete image; both minimums must be smaller than their maximums. The prompt requests the whole outer red diamond.

Each succeeded review retains this unmodified validated raw `output` and separately exposes `projectedAnnotations` with original-pixel boxes: `x=xmin*width/1000`, `y=ymin*height/1000`, box width `(xmax-xmin)*width/1000`, height `(ymax-ymin)*height/1000`. This is a coordinate conversion only, without adjusting labels, confidence, boxes, or uncertainty. Malformed output, refusal, truncated answers, unknown codes and extra properties fail that review.

Comparison exposes separate `labels` (code counts, including repeated symbols), `locations` (maximum-cardinality same-code matching with IoU >= 0.5, matched indices and IoU, unmatched indices), `uncertainty` (code/uncertainty counts and matched flags when locations align), and `pageAssessment` (type/readability). These diagnostics do not establish truth. Overall `agree` is deliberately conservative: all annotation fields and the page assessment must match exactly, ignoring annotation order and treating equivalent numeric forms such as 1 and 1.0 equally. Any difference is `disagree`; a failed review is `incomplete`.

Empty agreeing lists remain AI prelabels, including on technical drawings or unreadable images; they never establish a confirmed negative image. The page assessment distinguishes a readable label from a technical drawing or uncertain content. `sameConfiguredModel`, `sameReturnedModel` and `independentErrorsGuaranteed:false` disclose that separate calls do not establish independent errors.

Errors are sanitized: 401/403 auth, 413 size, 422 invalid input, 429 capacity, 503 missing configuration/unavailable ML, 502 both reviews failed, 504 timeout. No provider payload or image data is returned in errors. A provider/model/credential choice and live image call remain required evidence before claiming real AI execution; HTTP mocks prove only the transport contract.
