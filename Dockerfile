# PentAGI pentest sandbox + Playwright (interactive browser automation).
# Base is PentAGI's own Kali image, so all existing pentest tools stay.
FROM vxcontrol/kali-linux:latest

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers

# Node.js + npm straight from Kali's repos
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs npm ca-certificates \
 && node -v && npm -v \
 && rm -rf /var/lib/apt/lists/*

# webauto CLI + its Playwright dependency, and Chromium with OS deps
COPY webauto.js /opt/webauto/webauto.js
RUN cd /opt/webauto \
 && npm init -y >/dev/null 2>&1 \
 && npm install playwright@1.49.1 \
 && npx --yes playwright@1.49.1 install chromium \
 && printf '#!/bin/sh\nexec node /opt/webauto/webauto.js "$@"\n' > /usr/local/bin/webauto \
 && chmod +x /usr/local/bin/webauto \
 && rm -rf /root/.npm \
 && node -e "require('/opt/webauto/node_modules/playwright'); console.log('playwright OK')"
