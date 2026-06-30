// Builds the sweepstake standings page from live football-data.org results.
// Run by GitHub Actions. Outputs ./site/index.html
const fs = require("fs");

// ---- Your sweepstake (the only things you'd ever edit) --------------------
const GROUPS = {
  A:["Mexico","South Africa","South Korea","Czechia"],
  B:["Canada","Bosnia & Herzegovina","Qatar","Switzerland"],
  C:["Brazil","Morocco","Haiti","Scotland"],
  D:["United States","Paraguay","Australia","Türkiye"],
  E:["Germany","Curaçao","Ivory Coast","Ecuador"],
  F:["Netherlands","Japan","Sweden","Tunisia"],
  G:["Belgium","Egypt","Iran","New Zealand"],
  H:["Spain","Cape Verde","Saudi Arabia","Uruguay"],
  I:["France","Senegal","Iraq","Norway"],
  J:["Argentina","Algeria","Austria","Jordan"],
  K:["Portugal","DR Congo","Uzbekistan","Colombia"],
  L:["England","Croatia","Ghana","Panama"]
};
const SQUADS = [
  {owner:"Josh R",teams:["Argentina","Switzerland","Norway","Ghana"]},
  {owner:"Lachie M",teams:["Spain","Iran","Egypt","Qatar"]},
  {owner:"James S",teams:["France","Austria","Canada","South Africa"]},
  {owner:"Flynn H",teams:["England","Japan","Sweden","Bosnia & Herzegovina"]},
  {owner:"Azi",teams:["Portugal","United States","Algeria","Iraq"]},
  {owner:"Ben W",teams:["Brazil","Ecuador","Panama","New Zealand"]},
  {owner:"Callum M-P",teams:["Morocco","Senegal","Ivory Coast","Saudi Arabia"]},
  {owner:"Connor C",teams:["Netherlands","Mexico","Czechia","Jordan"]},
  {owner:"Tom N",teams:["Belgium","Uruguay","Paraguay","Uzbekistan"]},
  {owner:"Nate C",teams:["Germany","Australia","Tunisia","Haiti"]},
  {owner:"Henry R",teams:["Croatia","South Korea","DR Congo","Curaçao"]},
  {owner:"Pahul M",teams:["Colombia","Türkiye","Scotland","Cape Verde"]}
];
const FLAGS = {
  "Argentina":"🇦🇷","Switzerland":"🇨🇭","Norway":"🇳🇴","Ghana":"🇬🇭","Spain":"🇪🇸","Iran":"🇮🇷","Egypt":"🇪🇬","Qatar":"🇶🇦",
  "France":"🇫🇷","Austria":"🇦🇹","Canada":"🇨🇦","South Africa":"🇿🇦","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Japan":"🇯🇵","Sweden":"🇸🇪","Bosnia & Herzegovina":"🇧🇦",
  "Portugal":"🇵🇹","United States":"🇺🇸","Algeria":"🇩🇿","Iraq":"🇮🇶","Brazil":"🇧🇷","Ecuador":"🇪🇨","Panama":"🇵🇦","New Zealand":"🇳🇿",
  "Morocco":"🇲🇦","Senegal":"🇸🇳","Ivory Coast":"🇨🇮","Saudi Arabia":"🇸🇦","Netherlands":"🇳🇱","Mexico":"🇲🇽","Czechia":"🇨🇿","Jordan":"🇯🇴",
  "Belgium":"🇧🇪","Uruguay":"🇺🇾","Paraguay":"🇵🇾","Uzbekistan":"🇺🇿","Germany":"🇩🇪","Australia":"🇦🇺","Tunisia":"🇹🇳","Haiti":"🇭🇹",
  "Croatia":"🇭🇷","South Korea":"🇰🇷","DR Congo":"🇨🇩","Curaçao":"🇨🇼","Colombia":"🇨🇴","Türkiye":"🇹🇷","Scotland":"🏴󠁧󠁢󠁳󠁣󠁤󠁿","Cape Verde":"🇨🇻"
};

// ---- Name matching: tolerant of the feed's spelling variants --------------
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const CANON = Object.values(GROUPS).flat();
const CANON_NORM = CANON.map(t => [norm(t), t]);
const NMAP = {};
CANON.forEach(t => { NMAP[norm(t)] = t; });
[ // feed spelling -> our name
  ["korea republic","South Korea"],["republic of korea","South Korea"],["south korea","South Korea"],
  ["cote divoire","Ivory Coast"],["côte d'ivoire","Ivory Coast"],["ivory coast","Ivory Coast"],
  ["czech republic","Czechia"],["turkey","Türkiye"],["turkiye","Türkiye"],
  ["bosnia and herzegovina","Bosnia & Herzegovina"],["bosnia-herzegovina","Bosnia & Herzegovina"],
  ["dr congo","DR Congo"],["congo dr","DR Congo"],["democratic republic of the congo","DR Congo"],["congo democratic republic","DR Congo"],
  ["united states","United States"],["usa","United States"],["united states of america","United States"],
  ["cabo verde","Cape Verde"],["cape verde","Cape Verde"],["cape verde islands","Cape Verde"],
  ["curacao","Curaçao"],["ir iran","Iran"],["iran islamic republic","Iran"],["islamic republic of iran","Iran"],
  ["korea dpr","__ignore__"],["north korea","__ignore__"]
].forEach(([k,v]) => { NMAP[norm(k)] = v; });

function resolve(name){
  if(!name) return null;
  const k = norm(name);
  if(NMAP[k]) return NMAP[k]==="__ignore__" ? null : NMAP[k];
  // fallback: unique canonical whose key is contained in (or contains) the feed name
  const hits = CANON_NORM.filter(([cn]) => k.includes(cn) || cn.includes(k));
  if(hits.length === 1) return hits[0][1];
  return null;
}

// ---- helpers --------------------------------------------------------------
const TEAM_OWNER = {}; const ALL_TEAMS = [];
SQUADS.forEach(s => s.teams.forEach(t => { TEAM_OWNER[t]=s.owner; ALL_TEAMS.push(t); }));
const FIXTURES = [];
Object.keys(GROUPS).forEach(g => { const t=GROUPS[g]; for(let i=0;i<t.length;i++) for(let j=i+1;j<t.length;j++) FIXTURES.push({id:t[i]+"__"+t[j],group:g,a:t[i],b:t[j]}); });
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const fl = n => FLAGS[n]||"";
const gdtxt = n => n>0?("+"+n):(""+n);
const gdcls = n => n>0?"pos":(n<0?"neg":"");
const pairKey = (x,y) => [x,y].sort().join("__");
const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], MONS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function nz(iso){
  const d = new Date(new Date(iso).getTime() + 12*3600*1000); // NZST = UTC+12 (June/July)
  const hh=("0"+d.getUTCHours()).slice(-2), mm=("0"+d.getUTCMinutes()).slice(-2);
  return { date:DAYS[d.getUTCDay()]+" "+d.getUTCDate()+" "+MONS[d.getUTCMonth()], time:hh+":"+mm,
           ymd:d.getUTCFullYear()+"-"+(d.getUTCMonth()+1)+"-"+d.getUTCDate(), full:DAYS[d.getUTCDay()]+" "+d.getUTCDate()+" "+MONS[d.getUTCMonth()]+", "+hh+":"+mm+" NZST" };
}
const prettyStage = s => ({LAST_32:"Round of 32",ROUND_OF_32:"Round of 32",LAST_16:"Round of 16",ROUND_OF_16:"Round of 16",QUARTER_FINALS:"Quarter-finals",QUARTER_FINAL:"Quarter-finals",SEMI_FINALS:"Semi-finals",SEMI_FINAL:"Semi-finals",THIRD_PLACE:"Third place",FINAL:"Final"}[s] || (s||"Knockout").replace(/_/g," ").toLowerCase());

async function main(){
  const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
  if(!TOKEN){ console.error("ERROR: FOOTBALL_DATA_TOKEN is not set (add it as a repo secret)."); process.exit(1); }
  let data;
  try {
    const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", { headers:{ "X-Auth-Token":TOKEN } });
    if(!res.ok){ console.error("ERROR: API responded", res.status, (await res.text()).slice(0,300)); process.exit(1); }
    data = await res.json();
  } catch(e){ console.error("ERROR: could not reach football-data.org —", e.message); process.exit(1); }
  const matches = (data && data.matches) || [];
  console.log("Fetched", matches.length, "matches from football-data.org");

  const SCHED = {};        // pairKey -> utcDate (only when both teams resolved)
  const RESBYPAIR = {};    // pairKey -> {home, away, hg, ag}
  const credit = [];       // {H, A, hg, ag, win}  (either side may be null)
  const knockouts = [];
  const unknown = new Set();
  let groupPlayed = 0, groupGoals = 0, skipped = 0;

  matches.forEach(m => {
    const Hraw = m.homeTeam && m.homeTeam.name, Araw = m.awayTeam && m.awayTeam.name;
    const H = resolve(Hraw), A = resolve(Araw);
    if(!H && Hraw) unknown.add(Hraw);
    if(!A && Araw) unknown.add(Araw);
    const isGroup = (m.stage||"").toUpperCase()==="GROUP_STAGE";
    const ft = (m.score && m.score.fullTime) || {};
    const done = m.status==="FINISHED" && ft.home!=null && ft.away!=null;
    if(m.utcDate && H && A) SCHED[pairKey(H,A)] = m.utcDate;
    if(done){
      const win = m.score.winner==="HOME_TEAM"?"H":m.score.winner==="AWAY_TEAM"?"A":m.score.winner==="DRAW"?"D":(ft.home>ft.away?"H":ft.away>ft.home?"A":"D");
      credit.push({H,A,hg:ft.home,ag:ft.away,win});
      if(H && A) RESBYPAIR[pairKey(H,A)] = {home:H,away:A,hg:ft.home,ag:ft.away};
      if(isGroup){ groupPlayed++; groupGoals += ft.home+ft.away; }
      if(!H || !A) skipped++;
    }
    if(!isGroup && H && A) knockouts.push({home:H,away:A,utc:m.utcDate,stage:m.stage,score: done?{hg:ft.home,ag:ft.away}:null});
  });
  if(unknown.size) console.warn("WARNING: these feed names did not match any team — add them to NMAP:", JSON.stringify([...unknown]));
  if(skipped) console.warn("NOTE:", skipped, "finished match(es) had one unmatched side; the matched team was still credited.");

  // ---- standings (credit each resolved side independently) ----------------
  const TS = {}; ALL_TEAMS.forEach(n => TS[n]={p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0});
  credit.forEach(m => {
    if(m.H && TS[m.H]){ const a=TS[m.H]; a.p++; a.gf+=m.hg; a.ga+=m.ag;
      if(m.win==="H"){a.w++;a.pts+=3;} else if(m.win==="A"){a.l++;} else {a.d++;a.pts++;} }
    if(m.A && TS[m.A]){ const b=TS[m.A]; b.p++; b.gf+=m.ag; b.ga+=m.hg;
      if(m.win==="A"){b.w++;b.pts+=3;} else if(m.win==="H"){b.l++;} else {b.d++;b.pts++;} }
  });
  const owners = SQUADS.map(s => {
    const r={p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0};
    s.teams.forEach(n=>{const x=TS[n];r.p+=x.p;r.w+=x.w;r.d+=x.d;r.l+=x.l;r.gf+=x.gf;r.ga+=x.ga;r.pts+=x.pts;});
    return {owner:s.owner,teams:s.teams,...r,gd:r.gf-r.ga};
  }).sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.owner.localeCompare(b.owner));

  const TODAY = nz(new Date().toISOString()).ymd;
  const UPDATED = nz(new Date().toISOString()).full;

  // ---- panels
  const playersHtml = owners.map((r,i)=>{
    const lead=i===0&&r.p>0;
    const detail=r.teams.map(n=>{const x=TS[n];
      return `<div class="team"><span class="fl">${fl(n)}</span><span class="tn">${esc(n)}</span>`+
        `<span class="wd">${x.w}-${x.d}-${x.l}</span><span class="gg">${x.gf}:${x.ga}</span><span class="tp">${x.pts}</span></div>`;}).join("");
    return `<details class="card${lead?' lead':''}"><summary>`+
      `<div class="rank${lead?' lead':''}">${i+1}</div>`+
      `<div class="nm"><div class="o">${esc(r.owner)}</div><div class="f">${r.teams.map(fl).join(" ")}</div></div>`+
      `<div class="pts"><div class="v${lead?' lead':''}">${r.pts}</div><div class="l">pts</div></div></summary>`+
      `<div class="statline"><span>P ${r.p}</span><span class="pos">W ${r.w}</span><span>D ${r.d}</span>`+
        `<span class="neg">L ${r.l}</span><span class="gf">${r.gf}:${r.ga}</span>`+
        `<span class="${gdcls(r.gd)}" style="width:36px;text-align:right">${gdtxt(r.gd)}</span></div>`+
      `<div class="detail">${detail}</div></details>`;
  }).join("");

  const teamsRows = ALL_TEAMS.map(n=>{const x=TS[n];return {name:n,owner:TEAM_OWNER[n],p:x.p,gf:x.gf,ga:x.ga,gd:x.gf-x.ga,pts:x.pts};})
    .sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf).map(r=>
    `<tr><td><div class="tcell"><span class="fl">${fl(r.name)}</span><div><div class="tn">${esc(r.name)}</div>`+
    `<div class="ow">${esc(r.owner)} · P${r.p}</div></div></div></td>`+
    `<td class="num">${r.gf}:${r.ga}</td><td class="gd ${gdcls(r.gd)}">${gdtxt(r.gd)}</td><td class="tp">${r.pts}</td></tr>`).join("");
  const teamsHtml = `<div class="card"><table><thead><tr><th class="l">Team</th><th>GF:GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>${teamsRows}</tbody></table></div>`;

  function fixRow(a,b,iso,result){
    const aw=result&&result.sa>result.sb, bw=result&&result.sb>result.sa, drawn=result&&!aw&&!bw;
    let cls="fix", meta="", right=""; let today=false;
    if(iso && !result && nz(iso).ymd===TODAY){ today=true; cls+=" today"; }
    if(result){ right=`<div class="sc">${result.sa} – ${result.sb}</div>`; meta=iso?`${nz(iso).date} · Full&nbsp;time`:`Full&nbsp;time`; }
    else if(iso){ const t=nz(iso); right=`<div class="ko" data-ko="${iso}">${t.time}</div>`;
      meta=`<span class="metadate" data-ko="${iso}">${t.date}</span>${today?' <span class="tag today">TODAY</span>':''}`; }
    else { right=`<div class="tbc">TBC</div>`; meta="Time to be confirmed"; }
    const dim=drawn?' style="opacity:.85"':'';
    return `<div class="${cls}" ${iso?`data-koisrow="${iso}"`:''}><div class="ts">`+
      `<div class="ln ${aw?'b':''}"${dim}>${fl(a)} ${esc(a)}</div>`+
      `<div class="ln ${bw?'b':''}"${dim} style="margin-top:3px">${fl(b)} ${esc(b)}</div>`+
      `<div class="meta">${meta}</div></div><div class="rt">${right}</div></div>`;
  }

  const fixturesHtml = Object.keys(GROUPS).map(g=>{
    const fx=FIXTURES.filter(f=>f.group===g).sort((x,y)=>{
      const tx=SCHED[pairKey(x.a,x.b)]?new Date(SCHED[pairKey(x.a,x.b)]).getTime():Infinity;
      const ty=SCHED[pairKey(y.a,y.b)]?new Date(SCHED[pairKey(y.a,y.b)]).getTime():Infinity;
      return tx-ty; });
    let cnt=0;
    const rows=fx.map(f=>{
      const rp=RESBYPAIR[pairKey(f.a,f.b)]; let result=null;
      if(rp){ cnt++; result = rp.home===f.a ? {sa:rp.hg,sb:rp.ag} : {sa:rp.ag,sb:rp.hg}; }
      return fixRow(f.a,f.b,SCHED[pairKey(f.a,f.b)],result);
    }).join("");
    const open=cnt>0?" open":"";
    return `<details class="card"${open}><summary class="ghead"><span class="gl">Group ${g}</span>`+
      `<span class="gf">${GROUPS[g].map(fl).join(" ")}</span><span class="cnt${cnt===6?' full':''}">${cnt}/6</span></summary>`+
      `<div class="fixwrap">${rows}</div></details>`;
  }).join("");

  let knockoutHtml = "";
  if(knockouts.length){
    knockouts.sort((x,y)=> (new Date(x.utc||0)) - (new Date(y.utc||0)) );
    const rows = knockouts.map(k=>{
      const result = k.score ? {sa:k.score.hg,sb:k.score.ag} : null;
      return fixRow(k.home,k.away,k.utc,result).replace('<div class="meta">', `<div class="meta">${esc(prettyStage(k.stage))} · `);
    }).join("");
    knockoutHtml = `<details class="card" open><summary class="ghead"><span class="gl">Knockouts</span>`+
      `<span class="cnt">${knockouts.filter(k=>k.score).length}/${knockouts.length}</span></summary>`+
      `<div class="fixwrap">${rows}</div></details>`;
  }

  const html = PAGE({played:groupPlayed, goals:groupGoals, UPDATED, playersHtml, teamsHtml, fixturesHtml, knockoutHtml});
  fs.mkdirSync("site", {recursive:true});
  fs.writeFileSync("site/index.html", html);
  console.log("Wrote site/index.html —", groupPlayed, "group games,", owners.filter(o=>o.p>0).length, "players on the board; leader:", owners[0] && owners[0].owner, owners[0] && owners[0].pts+"pts");
}

function PAGE(d){ return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>World Cup Sweepstakes — Standings</title>
<style>
  :root{--bg:#0a0f1e;--surface:#141a2c;--line:#2a3350;--text:#eef2fb;--muted:#8a95b4;--gold:#f5c518;--green:#27c46b;--red:#f0556b;--accent:#6c6cf0;}
  *{box-sizing:border-box} html,body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
  .wrap{max-width:560px;margin:0 auto;padding:0 14px 48px} header{padding:20px 0 14px}
  .kicker{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--gold);font-weight:700}
  .vbadge{float:right;font-size:10px;font-weight:800;letter-spacing:1px;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:3px 7px}
  h1{margin:6px 0 0;font-size:30px;font-weight:800;letter-spacing:-.5px} .sub{margin-top:8px;font-size:13px;color:var(--muted)}
  .tabsel{position:absolute;left:-9999px;opacity:0}
  .tabs{display:flex;gap:4px;background:var(--surface);padding:4px;border-radius:12px;border:1px solid var(--line)}
  .tabs label{flex:1;text-align:center;padding:9px 0;border-radius:9px;cursor:pointer;font-size:14px;font-weight:700;color:var(--muted);user-select:none}
  #t-players:checked~.tabs label[for=t-players],#t-teams:checked~.tabs label[for=t-teams],#t-fixtures:checked~.tabs label[for=t-fixtures]{color:#fff;background:var(--accent)}
  .panel{display:none}
  #t-players:checked~#p-players,#t-teams:checked~#p-teams,#t-fixtures:checked~#p-fixtures{display:block}
  .card{margin-top:10px;border-radius:14px;background:var(--surface);border:1px solid var(--line);overflow:hidden}
  .card.lead{border-color:var(--gold)} summary{list-style:none;cursor:pointer} summary::-webkit-details-marker{display:none}
  details>summary{display:flex;align-items:center;gap:12px;padding:12px 14px}
  .rank{width:26px;font-size:18px;font-weight:800;color:var(--muted);font-variant-numeric:tabular-nums} .rank.lead{color:var(--gold)}
  .nm{flex:1;min-width:0}.nm .o{font-size:16px;font-weight:700}.nm .f{font-size:16px;margin-top:2px;letter-spacing:1px}
  .pts{text-align:right}.pts .v{font-size:24px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}.pts .v.lead{color:var(--gold)}
  .pts .l{font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase}
  .statline{display:flex;gap:14px;padding:0 14px 12px 52px;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}.statline .gf{margin-left:auto}
  .detail{border-top:1px solid var(--line);padding:6px 14px 10px}
  .team{display:flex;align-items:center;gap:8px;padding:7px 0;font-size:13.5px;font-variant-numeric:tabular-nums}
  .team .fl{font-size:17px}.team .tn{flex:1}.team .wd{color:var(--muted);font-size:12px}.team .gg{color:var(--muted);width:48px;text-align:right}.team .tp{width:26px;text-align:right;font-weight:700;color:var(--gold)}
  table{width:100%;border-collapse:collapse} thead th{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-weight:700;padding:11px 14px;border-bottom:1px solid var(--line);text-align:right} thead th.l{text-align:left}
  tbody td{padding:9px 14px;border-bottom:1px solid var(--bg);font-variant-numeric:tabular-nums}
  .tcell{display:flex;align-items:center;gap:8px}.tcell .fl{font-size:17px}.tcell .tn{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tcell .ow{font-size:11px;color:var(--muted)}
  td.num{text-align:right;font-size:13px;color:var(--muted)}td.gd{text-align:right;font-size:13px}td.tp{text-align:right;font-size:16px;font-weight:800;color:var(--gold)}
  .pos{color:var(--green)}.neg{color:var(--red)}
  .ghead .gl{font-weight:800;font-size:15px}.ghead .gf{font-size:15px;letter-spacing:1px}.ghead .cnt{margin-left:auto;font-size:12px;color:var(--muted)}.ghead .cnt.full{color:var(--green)}
  .fix{display:flex;align-items:center;gap:10px;padding:11px 14px;border-top:1px solid var(--bg)}
  .fix.today{background:rgba(245,197,24,.07);box-shadow:inset 3px 0 0 var(--gold)} .fix.live{background:rgba(240,85,107,.10);box-shadow:inset 3px 0 0 var(--red)}
  .fix .ts{flex:1;min-width:0}.fix .ts .ln{font-size:14px}.fix .ts .b{font-weight:800}.fix .meta{font-size:11px;color:var(--muted);margin-top:4px}
  .tag{font-size:9px;font-weight:800;letter-spacing:1px;border-radius:4px;padding:2px 5px}.tag.today{color:#1a1200;background:var(--gold)}.tag.live{color:#1a1200;background:var(--red)}
  .fix .rt{text-align:right;white-space:nowrap}.fix .sc{font-size:17px;font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums}
  .fix .ko{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}.fix .tbc{font-size:13px;color:var(--muted)}
  .foot{margin-top:16px;text-align:center;font-size:12px;color:var(--muted)}
</style></head><body>
<div class="wrap">
  <header><div><span class="kicker">Sweepstake · World Cup 2026</span><span class="vbadge">AUTO · VIEW ONLY</span></div>
    <h1>Standings</h1><div class="sub">${d.played} of 72 group games · ${d.goals} goals · Updated ${d.UPDATED}</div></header>
  <input class="tabsel" type="radio" name="tab" id="t-players" checked>
  <input class="tabsel" type="radio" name="tab" id="t-teams">
  <input class="tabsel" type="radio" name="tab" id="t-fixtures">
  <div class="tabs"><label for="t-players">Players</label><label for="t-teams">Teams</label><label for="t-fixtures">Fixtures</label></div>
  <div class="panel" id="p-players">${d.playersHtml}</div>
  <div class="panel" id="p-teams">${d.teamsHtml}</div>
  <div class="panel" id="p-fixtures">${d.fixturesHtml}${d.knockoutHtml}
    <div class="foot">Kick-off times in NZ time · highlighted games are on today · auto-updates regularly</div></div>
</div>
<script>
try{
  var nowt=new Date();
  document.querySelectorAll('.ko[data-ko]').forEach(function(el){el.textContent=new Date(el.getAttribute('data-ko')).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});});
  document.querySelectorAll('.metadate[data-ko]').forEach(function(el){el.textContent=new Date(el.getAttribute('data-ko')).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});});
  document.querySelectorAll('.fix[data-koisrow]').forEach(function(row){
    var d=new Date(row.getAttribute('data-koisrow'));
    var isToday=d.toDateString()===nowt.toDateString();
    var isLive=nowt>=d&&(nowt-d)<2*3600*1000&&!row.querySelector('.sc');
    row.classList.remove('today');var ex=row.querySelector('.tag');if(ex)ex.remove();
    var m=row.querySelector('.meta');
    if(isLive){row.classList.add('live');if(m)m.insertAdjacentHTML('beforeend',' <span class="tag live">LIVE</span>');}
    else if(isToday){row.classList.add('today');if(m)m.insertAdjacentHTML('beforeend',' <span class="tag today">TODAY</span>');}
  });
  var f=document.querySelector('.foot'); if(f)f.textContent='Kick-off times in your local timezone · highlighted games are on today · auto-updates regularly';
}catch(e){}
</script>
</body></html>`; }

main();
