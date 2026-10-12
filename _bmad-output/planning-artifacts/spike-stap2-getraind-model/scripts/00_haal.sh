#!/usr/bin/env bash
# Stap 0: invoer ophalen (alleen lezen). Legt vast hoe de scratchpad-bestanden tot stand kwamen.
# Gebruik: 00_haal.sh <scratchpad-map>
# Schrijft: <scr>/training-data-actief.tsv, <scr>/actieve-refs.json, <scr>/refs-alle/<id>.png,
#           <scr>/spike/train-uit/artwork-crops/<gtin>/<bestand>.png
# Sleutels staan alleen in de omgeving van de ml-service-container en worden nooit geprint.
set -euo pipefail
SCR="$1"; mkdir -p "$SCR/spike"
C=ml-service-qsookwow8koko0kwg00g0cwk-073152410606   # ml-service-container op ACC-host vanilla

# 1. Gevalideerde, actieve trainingsuitsneden (ACC Postgres op cherry, alleen SELECT)
ssh cherry "sudo -u postgres psql -d logo_recognition -At -F \$'\t' -c \"select id, label, crop_path, provenance->>'sourceFile', provenance->>'method', confidence, created_at::date from training_data where active and validated and crop_path is not null order by label, created_at;\"" > "$SCR/training-data-actief.tsv"

# 2. Actieve referenties (id, code, source, path) — de gedeactiveerde f1a85af9-… valt hier al buiten
ssh cherry "sudo -u postgres psql -d logo_recognition -At -c \"select json_agg(json_build_object('id', id, 'code', t3777_code, 'source', source, 'path', storage_path)) from reference_logos where active;\"" > "$SCR/actieve-refs.json"
# Referentiebestanden: zelfde MinIO-leesstap als hieronder, met storage_path als pad en <id>.png als doelnaam in refs-alle/.

# 3. Bestanden uit MinIO lezen via de container (bucket training-images), daarna opruimen op host én in container
cut -f3 "$SCR/training-data-actief.tsv" | sort -u > "$SCR/spike/train-paden.txt"
cat > "$SCR/spike/haal-train.py" <<'EOF'
import os
from minio import Minio
c = Minio(os.environ["MINIO_ENDPOINT"] + ":" + os.environ["MINIO_PORT"], access_key=os.environ["MINIO_ACCESS_KEY"],
          secret_key=os.environ["MINIO_SECRET_KEY"], secure=False)
ok, miss = 0, []
for p in open("/tmp/train-paden.txt").read().split():
    try:
        c.fget_object("training-images", p, os.path.join("/tmp/train-uit", p)); ok += 1
    except Exception as e:
        miss.append(p + "\t" + type(e).__name__)
os.makedirs("/tmp/train-uit", exist_ok=True)
open("/tmp/train-uit/_ontbrekend.tsv", "w").write("\n".join(miss))
print("ok", ok, "ontbrekend", len(miss))
EOF
scp -q "$SCR/spike/haal-train.py" "$SCR/spike/train-paden.txt" vanilla:/tmp/
ssh vanilla "docker cp /tmp/haal-train.py $C:/tmp/ && docker cp /tmp/train-paden.txt $C:/tmp/ && docker exec $C /opt/venv/bin/python /tmp/haal-train.py && docker cp $C:/tmp/train-uit /tmp/train-uit"
scp -rq vanilla:/tmp/train-uit "$SCR/spike/train-uit"
ssh vanilla "rm -rf /tmp/train-uit /tmp/haal-train.py /tmp/train-paden.txt; docker exec -u root $C rm -rf /tmp/train-uit /tmp/haal-train.py /tmp/train-paden.txt; ls /tmp | grep -E 'train-uit|haal-train|train-paden' || echo host-schoon; docker exec $C ls /tmp | grep -E 'train-uit|haal-train|train-paden' || echo container-schoon"
# De referentiebestanden (refs-alle/<id>.png) zijn op 12-10 op dezelfde manier gelezen (zie haal-alle-refs.py in de scratchpad van het onderzoek).
