#!/usr/bin/env python3
# Copyright 2026 Ishvir Jackpersad
# SPDX-License-Identifier: Apache-2.0
#
# Builds docs/replay.html from docs/RECEIPTS.md (scenes and signatures) and the newest
# evidence/ledger-*.json (times, results, events). Signatures are never typed by hand.
import datetime, glob, json, os, re, sys

R = os.path.expanduser("~/solana/fall-school/referee")
E = os.path.expanduser("~/solana/fall-school/evidence")
SIG = re.compile(r"[1-9A-HJ-NP-Za-km-z]{80,90}")

scenes, cur = [], None
for line in open(R + "/docs/RECEIPTS.md").read().splitlines():
    if line.startswith("## "):
        cur = {"title": line[3:].strip(), "rows": []}
        scenes.append(cur)
        continue
    if cur is None or not line.startswith("|"):
        continue
    if set(line.replace("|", "").strip()) <= set("-: "):
        continue
    m = SIG.search(line)
    if not m:
        continue
    cells = [c.strip().replace("`", "") for c in line.strip().strip("|").split("|")]
    others = [c for c in cells if not SIG.search(c)]
    cur["rows"].append({
        "label": others[0] if others else "",
        "detail": " \u00b7 ".join(others[1:]),
        "sig": m.group(0),
    })
scenes = [s for s in scenes if s["rows"]]

files = sorted(glob.glob(E + "/ledger-*.json"), key=os.path.getmtime)
if not files:
    sys.exit("STOPPED: no evidence/ledger-*.json found")
ledger = json.load(open(files[-1]))
led = {r["signature"]: r for r in ledger}

total = sum(len(s["rows"]) for s in scenes)
matched = sum(1 for s in scenes for r in s["rows"] if r["sig"] in led)
print("scenes: %d | receipt rows: %d | rows matched in the ledger: %d | ledger rows: %d" % (len(scenes), total, matched, len(ledger)))
print("ledger file: " + files[-1])
missing = [r["label"] for s in scenes for r in s["rows"] if r["sig"] not in led]
print("rows not in the ledger (DvP-only transactions are expected here): " + (", ".join(missing) if missing else "none"))

TEMPLATE = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Referee: replay of real devnet transactions</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NiA1NiI+PHJlY3Qgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iMTIiIGZpbGw9IiNmMmE5M2IiLz48dGV4dCB4PSIyOCIgeT0iMzgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtc2l6ZT0iMzAiIGZvbnQtd2VpZ2h0PSI3MDAiIGZpbGw9IiMwZjE0MTkiIGZvbnQtZmFtaWx5PSJ1aS1zYW5zLXNlcmlmLHN5c3RlbS11aSxIZWx2ZXRpY2EsQXJpYWwsc2Fucy1zZXJpZiI+UmU8L3RleHQ+PHJlY3QgeD0iMTIiIHk9IjQzIiB3aWR0aD0iMzIiIGhlaWdodD0iMyIgZmlsbD0iIzBmMTQxOSIvPjwvc3ZnPg==">
<style>
:root{--bg:#0b0f14;--card:#121923;--line:#223042;--text:#e6edf3;--mute:#8b9bb0;--ok:#3ddc97;--bad:#ff6b6b;--acc:#7aa2ff;--acc2:#b58cff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header,main,footer{max-width:1100px;margin:0 auto;padding:0 20px}
header{padding-top:28px}
h1{margin:0;font-size:30px;letter-spacing:.3px}
h2{margin:6px 0 0;font-size:19px}
.sub{color:var(--mute);margin-top:6px}
.banner{margin-top:14px;padding:10px 14px;border:1px solid var(--line);border-left:4px solid var(--acc2);border-radius:10px;background:#101722;color:var(--mute);font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:16px 0}
svg text{fill:var(--text);font:12px system-ui,sans-serif}
svg .mut{fill:var(--mute)}
.node rect{fill:#0f1620;stroke:var(--line);stroke-width:1.5;transition:all .35s}
.node.on rect{stroke:var(--acc);fill:#142033;filter:drop-shadow(0 0 8px rgba(122,162,255,.55))}
#box-ref,#box-dvp{fill:none;stroke:var(--line);stroke-width:1.5;transition:all .35s}
#box-ref.on{stroke:var(--acc)}
.edge{stroke:var(--line);stroke-width:1.6;fill:none;marker-end:url(#arr);transition:all .35s}
.edge.on{stroke:var(--acc2);stroke-width:2.6;stroke-dasharray:6 4;animation:flow 1s linear infinite}
@keyframes flow{to{stroke-dashoffset:-20}}
.tabs{display:flex;flex-wrap:wrap;gap:8px}
.tab,button.play{background:#0f1620;border:1px solid var(--line);color:var(--text);padding:8px 12px;border-radius:10px;cursor:pointer;font:inherit}
.tab.sel{border-color:var(--acc);background:#142033}
button.play{border-color:var(--acc2);margin-top:10px}
table{width:100%;border-collapse:collapse;margin-top:10px}
td,th{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mute);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.sig{font:12px ui-monospace,Menlo,Consolas,monospace;color:var(--acc);word-break:break-all;margin-bottom:4px}
.pill{padding:2px 9px;border-radius:99px;font-size:12px;background:#1a2433;color:var(--mute);white-space:nowrap}
.pill.ok{background:rgba(61,220,151,.15);color:var(--ok)}
.pill.bad{background:rgba(255,107,107,.15);color:var(--bad)}
button.c{background:none;border:1px solid var(--line);color:var(--mute);border-radius:8px;padding:2px 8px;cursor:pointer;font-size:12px}
a{color:var(--acc)}
.ev{color:var(--acc2);font:12px ui-monospace,Menlo,Consolas,monospace;margin-top:4px}
.mutd{color:var(--mute);font-size:13px}
footer{color:var(--mute);font-size:13px;padding-bottom:50px}
.claims{padding-left:20px}.claims li{margin:8px 0}.claims a{color:var(--text);text-decoration:none;border-bottom:1px dotted var(--mute)}
@media (max-width:700px){td:nth-child(4),th:nth-child(4){display:none}}
</style></head><body>
<header>
<h1 style="display:flex;align-items:center;justify-content:space-between">Referee<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NiA1NiI+PHJlY3Qgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iMTIiIGZpbGw9IiNmMmE5M2IiLz48dGV4dCB4PSIyOCIgeT0iMzgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtc2l6ZT0iMzAiIGZvbnQtd2VpZ2h0PSI3MDAiIGZpbGw9IiMwZjE0MTkiIGZvbnQtZmFtaWx5PSJ1aS1zYW5zLXNlcmlmLHN5c3RlbS11aSxIZWx2ZXRpY2EsQXJpYWwsc2Fucy1zZXJpZiI+UmU8L3RleHQ+PHJlY3QgeD0iMTIiIHk9IjQzIiB3aWR0aD0iMzIiIGhlaWdodD0iMyIgZmlsbD0iIzBmMTQxOSIvPjwvc3ZnPg==" alt="Referee mark" style="height:1.3em;width:1.3em;margin:0;border-radius:0"></h1>
<div class="sub">An independent settlement authority for Solana DvP trades. Built by Ishvir Jackpersad.</div>
<div class="banner"><b>This is a replay</b> of transactions recorded on Solana devnet on 14 and 15 October 2026 (UTC). Nothing here is live. Every row carries a signature you can check yourself with <code>solana confirm -v &lt;signature&gt; --url devnet</code>. Unaudited. Independent project, not affiliated with or endorsed by the Solana Foundation or J.P. Morgan.</div>
</header>
<main>
<div class="card">
<svg viewBox="0 0 920 400" width="100%" role="img" aria-label="Architecture of Referee">
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8b9bb0"/></marker></defs>
<text x="20" y="16" class="mut">OFF CHAIN</text>
<text x="300" y="16" class="mut">ON CHAIN (Solana devnet)</text>
<g class="node" id="n-parties"><rect x="20" y="40" width="170" height="70" rx="10"/><text x="105" y="70" text-anchor="middle">Parties A and B</text><text x="105" y="90" text-anchor="middle" class="mut">co-sign the exact terms</text></g>
<g class="node" id="n-issuer"><rect x="20" y="160" width="170" height="70" rx="10"/><text x="105" y="190" text-anchor="middle">Issuer</text><text x="105" y="210" text-anchor="middle" class="mut">demo key or Verifex PDA</text></g>
<g class="node" id="n-keeper"><rect x="20" y="280" width="170" height="70" rx="10"/><text x="105" y="310" text-anchor="middle">Anyone / keeper</text><text x="105" y="330" text-anchor="middle" class="mut">pays the fee, needs no authority</text></g>
<rect id="box-ref" x="300" y="26" width="330" height="350" rx="14"/>
<text x="465" y="48" text-anchor="middle">REFEREE program</text>
<g class="node" id="n-config"><rect x="320" y="62" width="290" height="50" rx="8"/><text x="465" y="92" text-anchor="middle">config: admin and issuer</text></g>
<g class="node" id="n-cred"><rect x="320" y="126" width="290" height="50" rx="8"/><text x="465" y="156" text-anchor="middle">credential PDAs: eligible flag and expiry</text></g>
<g class="node" id="n-trade"><rect x="320" y="190" width="290" height="50" rx="8"/><text x="465" y="220" text-anchor="middle">trade registry: terms and refund address</text></g>
<g class="node" id="n-pda"><rect x="320" y="254" width="290" height="60" rx="8"/><text x="465" y="280" text-anchor="middle">authority PDA</text><text x="465" y="298" text-anchor="middle" class="mut">signs DvP SettleDvp via invoke_signed</text></g>
<text x="465" y="346" text-anchor="middle" class="mut">settle: anyone may call it; needs registry and two credentials</text>
<rect id="box-dvp" x="730" y="110" width="170" height="190" rx="14"/>
<text x="815" y="134" text-anchor="middle">DvP program</text>
<text x="815" y="150" text-anchor="middle" class="mut">Solana Foundation, unmodified</text>
<g class="node" id="n-dvp"><rect x="745" y="165" width="140" height="110" rx="8"/><text x="815" y="208" text-anchor="middle">trade record</text><text x="815" y="226" text-anchor="middle">and two escrows</text><text x="815" y="248" text-anchor="middle" class="mut">rent swept to authority</text></g>
<path class="edge" id="e-parties" d="M190 75 C255 75 270 215 318 215"/>
<path class="edge" id="e-issuer" d="M190 195 C255 195 270 151 318 151"/>
<path class="edge" id="e-keeper" d="M190 315 C255 315 270 284 318 284"/>
<path class="edge" id="e-pda" d="M612 284 C675 284 690 220 743 220"/>
</svg>
</div>
<div class="card">
<h2>What these transactions prove</h2>
<ul class="claims">
<li><a href="#" data-go="core claim">A program-derived address can be the settlement authority of a Solana Foundation DvP trade, and it settled one on devnet.</a></li>
<li><a href="#" data-go="refusals">Unregistered trades, revoked credentials and early close attempts are refused on chain.</a></li>
<li><a href="#" data-go="registered">Registered, credentialed trades settle, and the rent DvP sweeps is returned to the address the parties chose.</a></li>
<li><a href="#" data-go="anyone">Anyone can trigger settlement: a wallet with no role in the trade did, and a keeper script found a trade by itself.</a></li>
<li><a href="#" data-go="unwinding">A rejected trade's registration can be closed and its rent returned.</a></li>
<li><a href="#" data-go="token-2022">Plain Token-2022 trades settle too: DvP alone settled one, then a Referee-gated one. Mint extensions are not checked.</a></li>
<li><a href="#" data-go="verifex">A program can be the credential issuer: a minimal Verifex checked one thing and issued credentials by CPI, and a refused agent got none. It does not yet bind the program to the subject.</a></li>
<li><a href="#" data-go="trustrail">A second Verifex instruction issues a credential only for the executor of a Passed commitment on a devnet-only copy of TrustRail: a wrong subject was refused, the right one traded and settled. TrustRail's Passed is a weak gate and its swap is a stand-in.</a></li>
</ul>
<div class="mutd">Devnet only, unaudited. Credentials are a demonstration, not KYC: the issuer is the author's demo key or the minimal Verifex program.</div>
</div>
<div class="card">
<div class="tabs" id="tabs"></div>
<div id="scene"></div>
<button class="play" id="play">Play this scene</button>
</div>
<div class="card">
<h2>Security checks</h2>
<p>Checked on 17 October 2026. These are point-in-time checks of the patterns and addresses named, not proof that nothing sensitive exists. The programs are devnet and unaudited.</p>
<ul>
<li>Key scan: the full git history of this repository was scanned with scripts/keyscan.py. It found no valid Solana keypair, private-key block or common token pattern. GitHub secret scanning also shows no alerts on this repository.</li>
<li>Gitleaks v8.30.1, an independent scanner, reported 10 matches in this repository. All are one value: the public address of this program authority account (see Program funds below), assigned to the constant EXPECTED_AUTH in the scripts. They are listed in .gitleaksignore, and the full account of the check is at ishvir.xyz/security.</li>
<li>Authorship: every commit is authored by my GitHub account, and the contributors page lists one contributor.</li>
<li>Wallets: the 56 receipts in docs/RECEIPTS.md were signed by 14 distinct addresses, three of which are program addresses. Each holds 0 SOL on mainnet.</li>
<li>Receipts against the chain: the ledger of calls to Referee holds 43 transactions. 37 are receipts and 6 appear on this page only. The other 19 receipts do not call Referee.</li>
<li>Program funds: the authority address (a program-derived address) held 0.01190752 SOL on devnet when I checked. No instruction withdraws it. The only transfer out is the rent refund during settle.</li>
<li>Upgrades: the program is upgradeable by my wallet and has had five in-place upgrades, each listed in the receipts.</li>
</ul>
<p>Full statement and how to repeat it: <a href="https://ishvir.xyz/security/" target="_blank" rel="noopener noreferrer">ishvir.xyz/security</a>.</p>
<h2>Full timeline</h2>
<div class="mutd" id="tlnote"></div>
<div id="timeline"></div>
</div>
</main>
<footer><a href="https://github.com/Portaudit/referee/graphs/contributors?from=7%2F11%2F2026" target="_blank" rel="noopener noreferrer">Contributor stats</a><br>
<a href="https://github.com/Portaudit/referee#how-this-was-built" target="_blank" rel="noopener noreferrer">How this was built</a><br>
Generated from docs/RECEIPTS.md and an on-chain ledger of the program's transactions (built __BUILT__). Source: <a href="https://github.com/Portaudit/referee" target="_blank" rel="noopener noreferrer">github.com/Portaudit/referee</a></footer>
<script>
const D=__DATA__;
const scenes=D.scenes,led={};
D.ledger.forEach(r=>{led[r.signature]=r});
const LBL={};scenes.forEach(function(s){s.rows.forEach(function(r){LBL[r.sig]=r.label})});
const MAP=[['trustrail',['n-parties','n-issuer','n-config','n-cred','n-trade','n-pda','n-dvp','e-parties','e-issuer','e-pda']],['token-2022',['n-parties','n-trade','n-cred','n-pda','n-dvp','e-parties','e-pda']],['upgrades',['box-ref']],['core claim',['n-pda','n-dvp','e-pda']],['setup',['n-issuer','n-config','n-cred','e-issuer']],['refusal',['n-trade','n-cred','n-pda']],['registered',['n-parties','n-trade','n-cred','n-pda','n-dvp','e-parties','e-pda']],['anyone',['n-keeper','n-pda','n-dvp','e-keeper','e-pda']],['unwinding',['n-parties','n-dvp','n-trade']],['verifex',['n-issuer','n-config','n-cred']]];
let timer=null;
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function lit(title){
  document.querySelectorAll('.node,.edge,#box-ref').forEach(function(e){e.classList.remove('on')});
  var t=title.toLowerCase();
  for(var i=0;i<MAP.length;i++){
    if(t.indexOf(MAP[i][0])>=0){MAP[i][1].forEach(function(id){var e=document.getElementById(id);if(e)e.classList.add('on')});break}
  }
}
function code(st){var m=/Custom\W+(\d+)/.exec(st);return m?m[1]:st}
function pill(s){
  var r=led[s];
  if(!r)return '<span class="pill">on chain</span>';
  return r.status==='ok'?'<span class="pill ok">ok</span>':'<span class="pill bad">refused, error '+esc(code(r.status))+'</span>';
}
function sigCell(s){
  var cmd='solana confirm -v '+s+' --url devnet';
  return '<div class="sig">'+esc(s)+'</div><button class="c" data-cmd="'+esc(cmd)+'">copy confirm command</button> <a target="_blank" rel="noopener" href="https://explorer.solana.com/tx/'+s+'?cluster=devnet">explorer</a>';
}
function when(r){return r?esc(r.time.replace('T',' ').replace('.000Z','')):''}
function show(i){
  var s=scenes[i];
  lit(s.title);
  document.querySelectorAll('.tab').forEach(function(t,j){t.classList.toggle('sel',j===i)});
  var h='<h2>'+esc(s.title)+'</h2><table><tr><th>Step</th><th>Result</th><th>Signature</th><th>Time (UTC)</th></tr>';
  s.rows.forEach(function(r,n){
    var l=led[r.sig];
    h+='<tr id="r'+n+'"><td>'+esc(r.label)+(r.detail?'<div class="mutd">'+esc(r.detail)+'</div>':'')+'</td><td>'+pill(r.sig)+(l&&l.events&&l.events.length?'<div class="ev">'+l.events.map(function(e){return esc(e.name)}).join(', ')+'</div>':'')+'</td><td>'+sigCell(r.sig)+'</td><td>'+when(l)+'</td></tr>';
  });
  h+='</table>';
  document.getElementById('scene').innerHTML=h;
}
function play(){
  clearInterval(timer);
  var rows=Array.prototype.slice.call(document.querySelectorAll('#scene tr[id]'));
  var n=0;
  rows.forEach(function(r){r.style.background=''});
  timer=setInterval(function(){
    rows.forEach(function(r){r.style.background=''});
    if(n>=rows.length){clearInterval(timer);return}
    rows[n].style.background='#17263a';
    rows[n].scrollIntoView({block:'nearest',behavior:'smooth'});
    n++;
  },1300);
}
var tabs=document.getElementById('tabs');
scenes.forEach(function(s,i){
  var b=document.createElement('button');
  b.className='tab';b.textContent=s.title;
  b.onclick=function(){clearInterval(timer);show(i)};
  tabs.appendChild(b);
});
document.getElementById('play').onclick=play;
document.addEventListener('click',function(e){
  var b=e.target.closest('button.c');
  if(b){if(navigator.clipboard){navigator.clipboard.writeText(b.dataset.cmd)}b.textContent='copied'}
});
function go(k){for(var i=0;i<scenes.length;i++){if(scenes[i].title.toLowerCase().indexOf(k)>=0){clearInterval(timer);show(i);document.getElementById('scene').scrollIntoView({behavior:'smooth'});return}}}
document.addEventListener('click',function(e){var a=e.target.closest('a[data-go]');if(a){e.preventDefault();go(a.dataset.go)}});
var start=0;
scenes.forEach(function(s,i){if(s.title.toLowerCase().indexOf('refusal')>=0)start=i});
show(start);
var tl='<table><tr><th>Time (UTC)</th><th>Instruction</th><th>Result</th><th>Signature</th></tr>';
D.ledger.forEach(function(r){
  tl+='<tr><td>'+when(r)+'</td><td>'+esc(r.instruction==='(none)'?'Program loader':r.instruction)+(LBL[r.signature]?'<div class="mutd">'+esc(LBL[r.signature])+'</div>':'')+(r.events&&r.events.length?'<div class="ev">'+r.events.map(function(e){return esc(e.name)}).join(', ')+'</div>':'')+'</td><td>'+pill(r.signature)+'</td><td>'+sigCell(r.signature)+'</td></tr>';
});
tl+='</table>';
document.getElementById('timeline').innerHTML=tl;
document.getElementById('tlnote').textContent=D.ledger.length+' transactions that called the REFEREE program, oldest first. Transactions that only called DvP (create, fund, reject) are not in this list.';
</script></body></html>'''

built = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
data = json.dumps({"scenes": scenes, "ledger": ledger}, ensure_ascii=False).replace("</", "<\\/")
html = TEMPLATE.replace("__DATA__", data).replace("__BUILT__", built)
out = R + "/docs/replay.html"
open(out, "w").write(html)
print("wrote %s (%d bytes)" % (out, len(html)))
