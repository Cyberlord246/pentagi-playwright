#!/usr/bin/env node
/*
 * webauto — interactive browser automation for PentAGI's agent.
 * Runs inside the pentest sandbox; the agent calls it via the terminal tool.
 * Outputs JSON so the agent can parse results.
 *
 * Usage:
 *   webauto open   --url URL [--proxy URL] [--out DIR]
 *   webauto login  --url URL --user U --pass P [--userSel CSS] [--passSel CSS] [--submitSel CSS] [--proxy URL] [--out DIR]
 *   webauto walk   --url URL [--max N] [--proxy URL] [--out DIR]   (login first with --user/--pass to walk authenticated)
 *   webauto script --file PATH.js [--out DIR]                       (run a custom Playwright script)
 *
 * Every run writes screenshots, page text, discovered links, cookies (Netscape
 * format for curl/nuclei) and a traffic log into --out (default: ./webauto-<ts>).
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');

function args() {
  const a = process.argv.slice(3), o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = (a[i+1] && !a[i+1].startsWith('--')) ? a[++i] : true;
  return o;
}
const cmd = process.argv[2];
const o = args();
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.resolve(o.out || `webauto-${ts}`);
fs.mkdirSync(out, { recursive: true });
const result = { cmd, out, steps: [], links: [], findings_hint: [], error: null };
const traffic = [];

function jlog() { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); }
function netscapeCookies(cookies) {
  const lines = ['# Netscape HTTP Cookie File'];
  for (const c of cookies) lines.push([c.domain, c.domain.startsWith('.') ? 'TRUE' : 'FALSE', c.path, c.secure ? 'TRUE' : 'FALSE', Math.floor(c.expires || 0), c.name, c.value].join('\t'));
  return lines.join('\n');
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], proxy: o.proxy ? { server: o.proxy } : undefined });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.on('request', r => traffic.push(`>> ${r.method()} ${r.url()}`));
  page.on('response', r => { traffic.push(`<< ${r.status()} ${r.url()}`); if ([401,403,500].includes(r.status())) result.findings_hint.push(`${r.status()} at ${r.url()}`); });
  const shot = async (n) => { const f = path.join(out, `${n}.png`); await page.screenshot({ path: f, fullPage: true }).catch(()=>{}); result.steps.push(`screenshot ${n}`); };
  const dumpText = async (n) => { const t = await page.content(); fs.writeFileSync(path.join(out, `${n}.html`), t); };

  try {
    if (!o.url && cmd !== 'script') throw new Error('--url required');

    if (cmd === 'script') {
      if (!o.file) throw new Error('--file required');
      const mod = require(path.resolve(o.file));
      await mod({ page, context, out, result });
    } else {
      await page.goto(o.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await shot('01-landing'); await dumpText('01-landing');
      result.finalUrl = page.url(); result.title = await page.title().catch(()=> '');

      if ((cmd === 'login' || (o.user && o.pass))) {
        const uSel = o.userSel || 'input[name="username"],input[name="email"],input[type="email"],#username,#email,input[name="user"]';
        const pSel = o.passSel || 'input[name="password"],input[type="password"],#password';
        const sSel = o.submitSel || 'button[type="submit"],input[type="submit"],button:has-text("Log in"),button:has-text("Sign in")';
        await page.fill(uSel, o.user).catch(()=> result.steps.push('WARN: user field not found'));
        await page.fill(pSel, o.pass).catch(()=> result.steps.push('WARN: pass field not found'));
        await shot('02-filled');
        await Promise.all([ page.waitForLoadState('networkidle', { timeout: 30000 }).catch(()=>{}), page.click(sSel).catch(()=> result.steps.push('WARN: submit not found')) ]);
        await shot('03-after-login'); await dumpText('03-after-login');
        result.afterLoginUrl = page.url();
        result.loggedIn = page.url() !== o.url;
      }

      if (cmd === 'walk' || o.walk) {
        const host = new URL(page.url()).host;
        const max = Number(o.max || 10);
        const links = await page.$$eval('a[href]', (as, host) => [...new Set(as.map(a=>a.href).filter(h=>{try{return new URL(h).host===host}catch{return false}}))], host);
        result.links = links.slice(0, max);
        let i = 4;
        for (const l of result.links) { try { await page.goto(l, { waitUntil: 'domcontentloaded', timeout: 20000 }); await shot(`${String(i).padStart(2,'0')}-page`); i++; } catch(e) { result.steps.push(`skip ${l}: ${e.message}`); } }
      }

      const cookies = await context.cookies();
      fs.writeFileSync(path.join(out, 'cookies.txt'), netscapeCookies(cookies));
      fs.writeFileSync(path.join(out, 'cookies.json'), JSON.stringify(cookies, null, 2));
      result.cookieHeader = cookies.map(c=>`${c.name}=${c.value}`).join('; ');
    }
  } catch (e) { result.error = e.message; }
  finally {
    fs.writeFileSync(path.join(out, 'traffic.log'), traffic.join('\n'));
    jlog(); await browser.close();
    console.log(JSON.stringify({ ok: !result.error, out, error: result.error, finalUrl: result.finalUrl, loggedIn: result.loggedIn, links: result.links.length, hints: result.findings_hint.slice(0,10) }, null, 2));
    process.exit(result.error ? 1 : 0);
  }
})();
