"""Verify the deployed ordinary ML HTTP route using exact original bytes.

No training, storage/database mutation, container action or forged authentication.
Public gateway serialization is tested separately by its injected route suite.
"""

import argparse
import base64
import datetime
import hashlib
import json
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument("--revision", required=True)
parser.add_argument("--model-sha256", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--additional-inputs")
args = parser.parse_args()
destination = Path(args.output)
if destination.exists():
    raise ValueError("Refusing to overwrite runtime evidence")
inputs = []
for image in sorted((ROOT / "apps/ml-service/app/assets/ghs").glob("*.png")):
    inputs.append(
        {
            "id": "official-" + image.stem,
            "kind": "official-integration-only",
            "path": str(image),
            "expectedCode": image.stem,
        }
    )
development = json.loads(
    (
        ROOT
        / "_bmad-output/planning-artifacts/research/ghs-sources-20261004/annotations/inputs.json"
    ).read_text()
)
for row in development["inputs"]:
    inputs.append(
        {
            "id": "development-" + row["id"],
            "kind": "development-ai-prelabels-not-gold",
            "path": row["imagePath"],
        }
    )
additional = (
    ROOT
    / "_bmad-output/planning-artifacts/research/ghs-training-20261004/sources/additional-sds"
)
annotation_path = additional / "annotations-frozen-v2.json"
for row in json.loads((additional / "manifest.json").read_text())["documents"]:
    if row.get("pageImage"):
        inputs.append(
            {
                "id": "additional-" + row["id"],
                "kind": "new-ai-validation-candidate-not-gold",
                "path": row["pageImage"],
            }
        )
photo_annotation_path = (
    additional.parent / "wikimedia-photos/annotations-frozen-v1.json"
)
photo_annotations = json.loads(photo_annotation_path.read_text())
for row in photo_annotations["images"]:
    inputs.append(
        {
            "id": "photograph-" + row["id"],
            "kind": "real-photograph-ai-prelabels-not-gold",
            "path": row["imagePath"],
        }
    )
extra_annotation_path = Path(__file__).with_name(
    "ghs-specialist-20261004-extra-source-freeze.json"
)
extra_annotations = json.loads(extra_annotation_path.read_text())
for row in extra_annotations["images"]:
    inputs.append(
        {k: row[k] for k in ["id", "kind", "path", "qualityScope", "familyId"]}
    )
expected_hashes = {
    "development-" + r["inputId"]: r["imageSha256"]
    for r in json.loads(
        (
            ROOT
            / "_bmad-output/planning-artifacts/research/ghs-training-20261004/development-final/baseline.json"
        ).read_text()
    )["images"]
}
for r in json.loads(annotation_path.read_text())["boxes"]:
    expected_hashes["additional-" + r["sourceId"]] = r["imageSha256"]
for r in photo_annotations["images"]:
    expected_hashes["photograph-" + r["id"]] = r["imageSha256"]
for r in extra_annotations["images"]:
    expected_hashes[r["id"]] = r["sha256"]
additional_production_hash = None
if args.additional_inputs:
    production_path = Path(args.additional_inputs)
    additional_production_hash = hashlib.sha256(
        production_path.read_bytes()
    ).hexdigest()
    for row in json.loads(production_path.read_text())["inputs"]:
        assert row["inputContractValid"]
        inputs.append(
            {
                "id": row["id"],
                "kind": "production-development-not-final-gold",
                "path": row["imagePath"],
                "familyId": row["provisionalSplitGroup"],
            }
        )
        expected_hashes[row["id"]] = row["imageSha256"]
assert len({row["id"] for row in inputs}) == len(inputs), "Duplicate input IDs"
assert len(
    {expected_hashes[row["id"]] for row in inputs if row["id"] in expected_hashes}
) == len(
    [row for row in inputs if row["id"] in expected_hashes]
), "Duplicate development image bytes"
for row in inputs:
    raw = Path(row["path"]).read_bytes()
    row.update(
        image=base64.b64encode(raw).decode("ascii"),
        sha256=hashlib.sha256(raw).hexdigest(),
        md5=hashlib.md5(raw).hexdigest(),
    )
    if row["id"] in expected_hashes:
        assert row["sha256"] == expected_hashes[row["id"]], (
            "Frozen input changed: " + row["id"]
        )
    with Image.open(row["path"]) as image:
        row["dimensions"] = list(image.size)
payload = {
    "expectedRevision": args.revision,
    "expectedModelSha256": args.model_sha256,
    "additionalProductionInputSha256": additional_production_hash,
    "extraAnnotationSha256": hashlib.sha256(
        extra_annotation_path.read_bytes()
    ).hexdigest(),
    "photographAnnotationSha256": hashlib.sha256(
        photo_annotation_path.read_bytes()
    ).hexdigest(),
    "annotationSha256": hashlib.sha256(annotation_path.read_bytes()).hexdigest(),
    "developmentAnnotationSha256": hashlib.sha256(
        (
            ROOT
            / "_bmad-output/planning-artifacts/research/ghs-training-20261004/development-final/baseline.json"
        ).read_bytes()
    ).hexdigest(),
    "inputs": inputs,
    "confidenceThresholds": [0.99, 0.87],
}
exposure = destination.with_suffix(".exposure.json")
exposure.parent.mkdir(parents=True, exist_ok=True)
with exposure.open("x") as stream:
    json.dump(
        {
            "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "expectedRevision": args.revision,
            "expectedModelSha256": args.model_sha256,
            "additionalProductionInputSha256": additional_production_hash,
            "annotationSha256": payload["annotationSha256"],
            "photographAnnotationSha256": payload["photographAnnotationSha256"],
            "extraAnnotationSha256": payload["extraAnnotationSha256"],
            "developmentAnnotationSha256": payload["developmentAnnotationSha256"],
            "confidenceThresholds": payload["confidenceThresholds"],
            "scope": "Conservatively mark all scheduled validation inputs as exposed before the first runtime call",
            "inputs": [
                {k: v for k, v in row.items() if k != "image"} for row in inputs
            ],
        },
        stream,
        indent=2,
    )
worker = r"""
import hashlib,json,os,sys,time
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
p=json.load(sys.stdin)
artifact=Path('/app/app/assets/ghs/specialist/model.json')
digest=hashlib.sha256(artifact.read_bytes()).hexdigest()
assert digest==p['expectedModelSha256'],'Deployed model checksum mismatch'
model_version=json.loads(artifact.read_bytes())['version']
port=int(os.environ.get('PORT','8001'))
base='http://127.0.0.1:'+str(port)
with urlopen(base+'/health',timeout=15) as r: health={'httpStatus':r.status,'body':json.load(r)}
results=[]
for row in p['inputs']:
    for threshold in p['confidenceThresholds']:
        request=Request(base+'/ml/detect',data=json.dumps({'image':row['image'],'confidence_threshold':threshold,'return_embeddings':False}).encode(),headers={'Content-Type':'application/json'})
        start=time.monotonic()
        try:
            with urlopen(request,timeout=45) as r: status,body=r.status,json.load(r)
        except HTTPError as exc: status,body=exc.code,{'error':'HTTP error; details withheld'}
        assert status==200,(row['id'],status)
        assert body['image_hash']==row['md5']
        assert all(d['confidence']>=threshold for d in body['detections'])
        assert all(d['confidence']<threshold and d['requires_review'] and d['uncertain'] for d in body['review_proposals'])
        ghs=[d for key in ['detections','review_proposals'] for d in body[key] if d['category']=='GHSSymbolDescriptionCode']
        assert all(d['requires_review'] and d['model_version'] for d in ghs)
        assert all(d['model_version']==model_version for d in ghs if d.get('method')=='ghs-specialist'),'Specialist response uses different model'
        if row.get('expectedCode'): assert [d['value'] for d in ghs]==[row['expectedCode']],row['id']
        for d in ghs:
            b=d['bbox'];w,h=row['dimensions']
            assert b['width']>0 and b['height']>0 and 0<=b['x']<w and 0<=b['y']<h and b['x']+b['width']<=w and b['y']+b['height']<=h
        results.append({**{k:v for k,v in row.items() if k!='image'},'requestedConfidenceThreshold':threshold,'httpStatus':status,'elapsedSeconds':round(time.monotonic()-start,3),'response':body})
print(json.dumps({'modelSha256':digest,'modelVersion':model_version,'health':health,'requests':results}))
"""
remote = """
import json,subprocess,sys
p=json.loads(PAYLOAD)
names=subprocess.check_output(['docker','ps','--filter','name=qsookwow8koko0kwg00g0cwk','--format','{{.Names}}'],text=True).splitlines()
containers=json.loads(subprocess.check_output(['docker','inspect',*names],text=True))
services={c['Config']['Labels'].get('com.docker.compose.service'):c for c in containers}
checks=[]
for service in ['app','ml-service']:
 c=services[service];revision=c['Config']['Labels'].get('org.opencontainers.image.revision');health=c['State'].get('Health',{}).get('Status')
 assert revision==p['expectedRevision'] and health=='healthy',(service,revision,health)
 checks.append({'service':service,'container':c['Name'],'revision':revision,'health':health})
run=subprocess.run(['docker','exec','-i',services['ml-service']['Name'],'python3','-c',WORKER],input=json.dumps(p),text=True,capture_output=True,timeout=600)
if run.returncode: raise RuntimeError('Runtime assertions failed: '+run.stderr[-2000:])
body=json.loads(run.stdout);body['containers']=checks;print(json.dumps(body))
"""
remote = (
    "PAYLOAD=" + repr(json.dumps(payload)) + "\nWORKER=" + repr(worker) + "\n" + remote
)
run = subprocess.run(
    [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=15",
        "vanilla",
        "python3",
        "-",
    ],
    input=remote,
    text=True,
    capture_output=True,
    timeout=660,
)
if run.returncode:
    raise RuntimeError("ACC verification failed: " + run.stderr[-2000:])
evidence = json.loads(run.stdout)
evidence.update(
    recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    expectedRevision=args.revision,
    independentFinalBenchmark=False,
    publicGatewayAuthenticatedRuntimeVerified=False,
    publicGatewaySerializationVerifiedByTests=True,
    liveDatabaseWritesPerformed=False,
    trainingPerformed=False,
    manualDeployOrRestartPerformed=False,
    additionalProductionInputSha256=additional_production_hash,
    additionalAnnotationSha256=payload["annotationSha256"],
    photographAnnotationSha256=payload["photographAnnotationSha256"],
    extraAnnotationSha256=payload["extraAnnotationSha256"],
    developmentAnnotationSha256=payload["developmentAnnotationSha256"],
)
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(evidence, indent=2))
print(
    json.dumps(
        {
            "requests": len(evidence["requests"]),
            "modelVersion": evidence["modelVersion"],
            "runtimeChecksPassed": True,
            "publicGatewayAuthenticatedRuntimeVerified": False,
        }
    )
)
