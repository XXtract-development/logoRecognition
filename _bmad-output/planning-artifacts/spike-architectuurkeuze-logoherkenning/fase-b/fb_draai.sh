#!/usr/bin/env bash
# Draait alle varianten van fase B op de meetset (na het bevriezen). Sleutel alleen in het geheugen van dit proces.
# K3c (CPU) loopt naast de taalmodelruns (K1a, K1b, VTF; netwerkgebonden); daarna de overige CPU-stappen achter elkaar.
set -uo pipefail
HIER="$(cd "$(dirname "$0")" && pwd)"; F=~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b; cd "$F"
export PYTHONPATH="$HIER" PYTHONWARNINGS=ignore PY="$F/.venv/bin/python"
export OPENROUTER_KEY="$(ssh vanilla 'C=$(docker ps --format "{{.Names}}" | grep "^ml-service-qsookwow8koko0kwg00g0cwk" | head -1); docker inspect $C --format "{{range .Config.Env}}{{println .}}{{end}}"' | sed -n 's/^GHS_REVIEW_API_KEY=//p')"
test -n "$OPENROUTER_KEY" || { echo "geen sleutel"; exit 1; }
mkdir -p log
( for run in 1 2; do env -u OPENROUTER_KEY $PY "$HIER/fb_k3c.py" $run > log/k3c-$run.log 2>&1; echo "k3c run $run klaar $(date -u +%T)"; done ) &
K3C=$!
for run in 1 2; do
  $PY "$HIER/fb_k1.py" k1a $run > log/k1a-$run.log 2>&1 & A=$!
  $PY "$HIER/fb_k1.py" k1b $run > log/k1b-$run.log 2>&1 & B=$!
  $PY "$HIER/fb_vtf.py" $run > log/vtf-$run.log 2>&1 & V=$!
  wait $A $B $V
  echo "taalmodelruns $run klaar $(date -u +%T)"
done
unset OPENROUTER_KEY
wait $K3C
for run in 1 2; do
  for v in k2a k2b k3b; do $PY "$HIER/fb_stap2.py" $v vtf $run >> log/cpu.log 2>&1; done
  for v in k2a k2b; do for b in k1a k1b; do $PY "$HIER/fb_stap2.py" $v $b $run >> log/cpu.log 2>&1; done; done
  echo "stap 2 run $run klaar $(date -u +%T)"
done
echo ALLES-KLAAR
