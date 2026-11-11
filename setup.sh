#!/usr/bin/env bash
# Build the PentAGI + Playwright sandbox image and wire an existing PentAGI
# checkout to use it. Run from this folder. Idempotent.
#
#   ./setup.sh /path/to/pentagi        # e.g. ./setup.sh ~/pentagi
#
set -euo pipefail
IMG="pentagi-kali-playwright:latest"
PENTAGI_DIR="${1:-}"

if [ -z "$PENTAGI_DIR" ] || [ ! -f "$PENTAGI_DIR/.env" ] && [ ! -f "$PENTAGI_DIR/.env.example" ]; then
  echo "Usage: ./setup.sh /path/to/pentagi   (the folder with PentAGI's docker-compose.yml and .env)"
  exit 1
fi

echo "==> 1/4 Pulling PentAGI's base Kali image (needed as the build base)"
docker pull vxcontrol/kali-linux:latest

echo "==> 2/4 Building $IMG (Kali + Node + Playwright + webauto)"
docker build -t "$IMG" .

echo "==> 3/4 Wiring $PENTAGI_DIR/.env to use it"
cd "$PENTAGI_DIR"
[ -f .env ] || cp .env.example .env
cp .env ".env.bak.$(date +%s)"
# set or append the two vars
for kv in "DOCKER_DEFAULT_IMAGE_FOR_PENTEST=$IMG" "DOCKER_IMAGE_SELECTION_MODE=fixed"; do
  k="${kv%%=*}"
  if grep -qE "^$k=" .env; then
    # portable in-place edit (GNU + BSD sed)
    sed -i.tmp "s|^$k=.*|$kv|" .env && rm -f .env.tmp
  else
    printf '\n%s\n' "$kv" >> .env
  fi
done
grep -E '^(DOCKER_DEFAULT_IMAGE_FOR_PENTEST|DOCKER_IMAGE_SELECTION_MODE)=' .env

echo "==> 4/4 Restarting PentAGI"
docker compose up -d --force-recreate pentagi
sleep 8
docker exec pentagi sh -c 'echo "in-container: image=$DOCKER_DEFAULT_IMAGE_FOR_PENTEST mode=$DOCKER_IMAGE_SELECTION_MODE"' || true

cat <<DONE

Done. One manual step left:
  Open PentAGI -> Settings -> Prompts and paste the contents of AGENT_GUIDANCE.md
  into the Pentester / Primary Agent system prompt, so the agent uses 'webauto'.

Quick check the image works:
  docker run --rm $IMG webauto open --url https://example.com --out /tmp/t
DONE
