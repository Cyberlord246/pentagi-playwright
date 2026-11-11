# PentAGI + Playwright — portable setup

This folder adds interactive browser automation (Playwright) to PentAGI's free
edition by building a custom pentest sandbox image. Copy this whole folder to the
new machine and follow the steps.

## Files
- `Dockerfile`        — Kali (PentAGI's base) + Node + Playwright + Chromium + webauto
- `webauto.js`        — the browser-automation CLI the agent calls
- `AGENT_GUIDANCE.md` — prompt text to paste into PentAGI's Settings -> Prompts
- `setup.sh`          — one-shot build + wire-up script

## On the new machine
1. Install and start PentAGI as usual (git clone, configure `.env`, `docker compose up -d`).
   Make sure it runs once so the base images are present.
2. Copy this folder over, then:
   ```bash
   cd pentagi-playwright-image
   ./setup.sh /path/to/pentagi      # the folder that holds PentAGI's docker-compose.yml
   ```
   This pulls the Kali base, builds `pentagi-kali-playwright:latest`, sets two vars in
   PentAGI's `.env` (`DOCKER_DEFAULT_IMAGE_FOR_PENTEST`, `DOCKER_IMAGE_SELECTION_MODE=fixed`),
   and restarts PentAGI.
3. In the PentAGI web UI: **Settings -> Prompts** -> paste `AGENT_GUIDANCE.md` into the
   Pentester / Primary Agent system prompt. (Prompts live in PentAGI's database, not a
   file, so this step is manual.)

## Verify
```bash
docker run --rm pentagi-kali-playwright:latest webauto open --url https://example.com --out /tmp/t
# expect: {"ok": true, ...} and files in /tmp/t
```

## Notes
- The build needs ~2 GB on top of the 22 GB Kali base (Docker shares the common layers).
- The first pentest flow after setup boots the new image, so it's a little slower once.
- To revert: set `DOCKER_IMAGE_SELECTION_MODE=` (empty) and
  `DOCKER_DEFAULT_IMAGE_FOR_PENTEST=` (empty) in `.env`, then restart; PentAGI goes back
  to the plain Kali sandbox. A `.env.bak.*` backup is written by setup.sh.
- Build base is `vxcontrol/kali-linux:latest`. If PentAGI updates its Kali image, rebuild
  this one to stay current.

## Usage (inside a flow, via the agent's terminal)
```
webauto open  --url URL
webauto login --url URL --user U --pass P
webauto walk  --url URL --user U --pass P --max 10
webauto script --file flow.js
```
Results (screenshots, html, cookies.txt, traffic.log, result.json) land in the --out dir.
Add `--proxy http://127.0.0.1:8080` to route through Burp/ZAP.
