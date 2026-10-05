"""Exercise deployed API MLClient transport, not public user authentication."""

import argparse
import base64
import datetime
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--revision", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--runtime-evidence")
parser.add_argument("--production-inputs")
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
output = Path(args.output)
if output.exists():
    raise ValueError("Refusing overwrite")
inputs = []
for path in sorted((root / "apps/ml-service/app/assets/ghs").glob("*.png")):
    raw = path.read_bytes()
    inputs.append(
        {
            "id": path.stem,
            "image": base64.b64encode(raw).decode(),
            "md5": hashlib.md5(raw).hexdigest(),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "expectedCodes": [path.stem],
        }
    )
runtime_hash = None
if args.runtime_evidence:
    runtime_path = Path(args.runtime_evidence)
    runtime = json.loads(runtime_path.read_text())
    assert runtime["expectedRevision"] == args.revision
    runtime_hash = hashlib.sha256(runtime_path.read_bytes()).hexdigest()
    for row in runtime["requests"]:
        if (
            row["id"].startswith("photograph-")
            and row["requestedConfidenceThreshold"] == 0.99
        ):
            raw = Path(row["path"]).read_bytes()
            assert hashlib.sha256(raw).hexdigest() == row["sha256"]
            predictions = [
                d
                for channel in ["detections", "review_proposals"]
                for d in row["response"][channel]
                if d["category"] == "GHSSymbolDescriptionCode"
            ]
            inputs.append(
                {
                    "id": row["id"],
                    "image": base64.b64encode(raw).decode(),
                    "md5": hashlib.md5(raw).hexdigest(),
                    "sha256": row["sha256"],
                    "expectedCodes": sorted(d["value"] for d in predictions),
                    "expectedGhs": predictions,
                }
            )
if args.runtime_evidence:
    expected_photo_ids = {
        "photograph-commons-01",
        "photograph-commons-02",
        "photograph-commons-05-original",
    }
    photo_ids = [row["id"] for row in inputs if row["id"].startswith("photograph-")]
    assert (
        len(inputs) == 12
        and len(photo_ids) == 3
        and set(photo_ids) == expected_photo_ids
    ), "Missing or duplicate frozen photograph inputs"
production_hash = None
if args.production_inputs:
    assert (
        args.runtime_evidence
    ), "Production transport requires frozen actual HTTP evidence"
    source_path = Path(args.production_inputs)
    production_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    assert (
        production_hash == runtime["additionalProductionInputSha256"]
    ), "Production inputs differ from actual HTTP freeze"
    production_rows = json.loads(source_path.read_text())["inputs"]
    assert 1 <= len(production_rows) <= 40
    for source in production_rows:
        matches = [
            row
            for row in runtime["requests"]
            if row["id"] == source["id"] and row["requestedConfidenceThreshold"] == 0.99
        ]
        assert (
            len(matches) == 1 and matches[0]["httpStatus"] == 200
        ), "Actual production HTTP response required"
        row = matches[0]
        raw = Path(source["imagePath"]).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        assert (
            digest == source["imageSha256"] == row["sha256"]
        ), "Production image bytes changed"
        predictions = [
            d
            for channel in ["detections", "review_proposals"]
            for d in row["response"][channel]
            if d["category"] == "GHSSymbolDescriptionCode"
        ]
        inputs.append(
            {
                "id": source["id"],
                "image": base64.b64encode(raw).decode(),
                "md5": hashlib.md5(raw).hexdigest(),
                "sha256": digest,
                "expectedCodes": sorted(d["value"] for d in predictions),
                "expectedGhs": predictions,
            }
        )
    assert len({row["id"] for row in inputs}) == len(
        inputs
    ), "Duplicate transport input"
node = r"""(async()=>{
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const p=JSON.parse(raw),module=await import('file:///app/dist/services/ml-client.js');
const client=module.mlClient||module.default.mlClient;
const health=await client.healthCheck(),results=[];
for(const row of p.inputs){
 const response=await client.detectLogosFromBuffer(Buffer.from(row.image,'base64'));
 if(response.image_hash!==row.md5)throw new Error('Image bytes changed');
 const ghs=[...response.detections,...response.review_proposals].filter(d=>d.category==='GHSSymbolDescriptionCode');
 if(JSON.stringify(ghs.map(d=>d.value).sort())!==JSON.stringify(row.expectedCodes)||!ghs.every(d=>d.requires_review))throw new Error('GHS transport contract failed');
 if(!response.detections.every(d=>d.confidence>=.99)||!response.review_proposals.every(d=>d.confidence<.99&&d.uncertain&&d.requires_review))throw new Error('Threshold contract failed');
 if(row.expectedGhs){const canonical=a=>a.map(d=>({value:d.value,bbox:d.bbox,confidence:d.confidence,model_version:d.model_version,reference_version:d.reference_version,uncertain:d.uncertain,method:d.method,confidence_kind:d.confidence_kind})).sort((a,b)=>a.value.localeCompare(b.value));if(JSON.stringify(canonical(ghs))!==JSON.stringify(canonical(row.expectedGhs)))throw new Error('Deployed buffer transport differs from frozen HTTP response');}
 results.push({id:row.id,imageSha256:row.sha256,response});
}
console.log('GHS_TRANSPORT_RESULT:'+JSON.stringify({health,results}));
})().catch(()=>{console.error('GHS_TRANSPORT_ERROR: transport check failed; sensitive details withheld');process.exit(1)});"""
remote = r"""
import json,subprocess
p=json.loads(PAYLOAD)
names=subprocess.check_output(['docker','ps','--filter','name=qsookwow8koko0kwg00g0cwk','--format','{{.Names}}'],text=True).splitlines()
containers=json.loads(subprocess.check_output(['docker','inspect',*names],text=True));roles={c['Config']['Labels'].get('com.docker.compose.service'):c for c in containers}
checks=[]
for name in ['app','ml-service']:
 c=roles[name];revision=c['Config']['Labels'].get('org.opencontainers.image.revision');health=c['State'].get('Health',{}).get('Status')
 assert revision==p['revision'] and health=='healthy'
 checks.append({'service':name,'revision':revision,'health':health})
result=subprocess.run(['docker','exec','-i',roles['app']['Name'],'node','-e',NODE],input=json.dumps(p),text=True,capture_output=True,timeout=120)
if result.returncode:raise RuntimeError('API transport verification failed; details withheld')
line=next(x[len('GHS_TRANSPORT_RESULT:'):] for x in result.stdout.splitlines() if x.startswith('GHS_TRANSPORT_RESULT:'))
body=json.loads(line);body['containers']=checks;print(json.dumps(body))
"""
remote = (
    "PAYLOAD="
    + repr(json.dumps({"revision": args.revision, "inputs": inputs}))
    + "\nNODE="
    + repr(node)
    + "\n"
    + remote
)
result = subprocess.run(
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
    timeout=160,
)
if result.returncode:
    raise RuntimeError("API transport verification failed: " + result.stderr[-1000:])
evidence = json.loads(result.stdout)
evidence.update(
    verifiedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    revision=args.revision,
    scope="Actual deployed API MLClient buffer/default threshold → network ML route; official integration and optional exposed development photographs/production images",
    runtimeEvidenceSha256=runtime_hash,
    productionInputsSha256=production_hash,
    publicGatewayAuthenticatedRuntimeVerified=False,
    publicGatewaySerializerVerifiedByTests=True,
    databaseWritesPerformed=False,
    trainingPerformed=False,
    authenticationFabricated=False,
    manualContainerActionPerformed=False,
)
with output.open("x") as f:
    json.dump(evidence, f, indent=2)
print(
    json.dumps(
        {
            "apiToMlTransportVerified": True,
            "requests": len(evidence["results"]),
            "publicGatewayAuthenticatedRuntimeVerified": False,
        }
    )
)
