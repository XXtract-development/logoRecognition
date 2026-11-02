#!/usr/bin/env bash
# Move acc-deploy to the commit both images were built from; Coolify follows that
# branch and deploys it on the GitHub push webhook (its API is unreachable from
# GitHub runners). Every read or write error fails the job; a stale rerun never
# moves the branch back.
set -euo pipefail

: "${REPO:?Set REPO (owner/name)}"
: "${DEPLOY_SHA:?Set DEPLOY_SHA (the commit both images were built from)}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
sha_re='^[0-9a-f]{40}$'
[[ "$DEPLOY_SHA" =~ $sha_re ]] || { echo "DEPLOY_SHA is no full commit: $DEPLOY_SHA" >&2; exit 1; }
err=$(mktemp)
trap 'rm -f "$err"' EXIT

note() { echo "$1"; echo "$1" >> "$summary"; }

acc=$(gh api "repos/$REPO/git/ref/heads/acc" --jq .object.sha)
[[ "$acc" =~ $sha_re ]] || { echo "Could not read the head of acc: '$acc'" >&2; exit 1; }
if [[ "$acc" != "$DEPLOY_SHA" ]]; then
  note "acc staat op $acc, niet op $DEPLOY_SHA: dit is een oude run, acc-deploy blijft staan."
  exit 0
fi

# gh prints the error body on stdout and "gh: ... (HTTP 404)" on stderr.
if deploy=$(gh api "repos/$REPO/git/ref/heads/acc-deploy" --jq .object.sha 2>"$err"); then
  [[ "$deploy" =~ $sha_re ]] || { echo "Could not read the head of acc-deploy: '$deploy'" >&2; exit 1; }
elif grep -q '(HTTP 404)' "$err"; then
  deploy=''
else
  cat "$err" >&2
  exit 1
fi

if [[ "$deploy" == "$DEPLOY_SHA" ]]; then
  note "acc-deploy staat al op $DEPLOY_SHA: er komt geen webhook en dus geen uitrol. Opnieuw uitrollen gaat via de knop Redeploy in Coolify."
  exit 0
fi

if [[ -z "$deploy" ]]; then
  gh api -X POST "repos/$REPO/git/refs" -f ref=refs/heads/acc-deploy -f sha="$DEPLOY_SHA" > /dev/null
  note "acc-deploy aangemaakt op $DEPLOY_SHA."
else
  gh api -X PATCH "repos/$REPO/git/refs/heads/acc-deploy" -f sha="$DEPLOY_SHA" -F force=true > /dev/null
  note "acc-deploy verschoven van $deploy naar $DEPLOY_SHA."
fi

cat >> "$summary" <<EOF

**Controle na deze run** (de workflow wacht niet op Coolify):
1. Coolify toont een webhook-uitrol van tak \`acc-deploy\` op commit \`$DEPLOY_SHA\`.
2. Op Vanilla tonen app én ml-service \`org.opencontainers.image.revision\` = \`$DEPLOY_SHA\` (zie docs/04-deployment/ci-bouwstraat.md).
3. Geen uitrol gestart? Dan kwam de webhook niet aan: klik Redeploy in Coolify; dat pakt de kop van \`acc-deploy\`, dus deze commit.
EOF
