// Turn a model into a self-contained HTML page. Pure string building.

import { fmt, daysWord, iso } from './dates.js';

// Contrasting marker colours (readable on light and dark), avoiding the
// time-off blue. Markers are coloured by position from a per-chart starting
// offset, so within one chart every marker is distinct.
const MARKER_COLORS = ['#d1495b', '#e08a1e', '#2a9d8f', '#8b5cf6',
                       '#c74b8b', '#5a9e3f', '#c56a1a', '#3aa0b8'];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// A small inline script that runs at page load from the viewer's own clock, so
// a saved chart stays current: it fills in each deadline label with a live
// "in N days" countdown, and draws the "now" line + elapsed shading. `win` is
// [startISO, endISO] of the quarter; `daysISO` is the ordered business days.
function nowScript(win, daysISO) {
  return '<script>\n(function(){\n' +
    '  var WIN=' + JSON.stringify(win) + ', DAYS=' + JSON.stringify(daysISO) + ';\n' +
    '  var t=new Date(), z=function(n){return (n<10?"0":"")+n;};\n' +
    '  var today=t.getFullYear()+"-"+z(t.getMonth()+1)+"-"+z(t.getDate());\n' +
    '  var DAY=86400000, todayMs=Date.parse(today+"T00:00:00Z");\n' +
    '  var plur=function(n){return n+" day"+(n===1?"":"s");};\n' +
    '  document.querySelectorAll("[data-deadline]").forEach(function(el){\n' +
    '    var d=Math.round((Date.parse(el.getAttribute("data-deadline")+"T00:00:00Z")-todayMs)/DAY);\n' +
    '    var s=d>0?("in "+plur(d)):d===0?"today":(plur(-d)+" ago");\n' +
    '    var c=document.createElement("span");c.className="cd";c.textContent=" — "+s;el.appendChild(c);\n' +
    '  });\n' +
    '  if(today<WIN[0]||today>WIN[1])return;\n' +
    '  var N=DAYS.length, now=0; while(now<N&&DAYS[now]<today)now++;\n' +
    '  var left=(now/N*100).toFixed(4)+"%";\n' +
    '  var plot=document.querySelector(".plot");\n' +
    '  if(plot){\n' +
    '    if(now>0){var e=document.createElement("div");e.className="elapsed";e.style.width=(now/N*100).toFixed(4)+"%";plot.insertBefore(e,plot.firstChild);}\n' +
    '    var m=document.createElement("div");m.className="mark now";m.style.left=left;plot.appendChild(m);\n' +
    '  }\n' +
    '  var lane=document.querySelector(".axisrow.bottom .lane");\n' +
    '  if(lane){var l=document.createElement("div");l.className="blab now";l.style.left=left;l.textContent="now";lane.appendChild(l);}\n' +
    '})();\n<\/script>';
}

export function renderHtml(config, model, { generatedAt = '', repo = null } = {}) {
  const { days, N, dayIndex, rows, monthSegs, monthBoundaries, weekSegs, weekLines, capacity, overall, window, manual, warnings } = model;
  const idx = (s) => (dayIndex.has(s) ? dayIndex.get(s) : null);
  const L = (i) => (i / N * 100).toFixed(4);
  const W = (w) => (w / N * 100).toFixed(4);
  const pctOf = (x) => `${Math.round(x * 100)}%`;

  // markers: config markers plus a built-in end-of-quarter deadline (EOQ),
  // placed on the quarter's last working day. Deadline labels get a live
  // "in N days" countdown from the client script.
  const markers = [...(config.markers || []), { date: iso(days[N - 1]), label: 'EOQ', deadline: true }];
  const markerBase = hashStr(config.group || '');
  const markerColor = new Map(markers.map((mk, i) => [mk, MARKER_COLORS[(markerBase + i) % MARKER_COLORS.length]]));

  const title = `${esc(config.group)} — Q${config.quarter.slice(-1)} ${config.quarter.slice(0, 4)} time off`;
  const rowH = 44, barH = 22;
  const plotH = rows.length * rowH;

  const p = [];
  p.push(HEAD.replace('__TITLE__', title));
  p.push('<div class="wrap">');
  if (config.eyebrow) p.push(`<div class="eyebrow">${esc(config.eyebrow)}</div>`);
  p.push(`<h1>${title}</h1>`);
  p.push(`<p class="sub">Window: ${fmt(days[0])} to ${fmt(days[N - 1])} ${days[N - 1].getUTCFullYear()} — ` +
    `${N} business days over ${weekSegs.length} weeks, weekends removed. ` +
    `Half days count as full. Consecutive runs merged.</p>`);

  p.push('<div class="card">');

  // month lane: labels, with a short edge tick at each month boundary
  const ml = ['<div class="axisrow"><div></div><div class="lane">'];
  for (const b of monthBoundaries) ml.push(`<div class="medge" style="left:${L(b)}%"></div>`);
  for (const s of monthSegs) ml.push(`<div class="m" style="left:${L(s.start + s.count / 2)}%">${esc(s.label)}</div>`);
  ml.push('</div><div class="rhead">working</div></div>');
  p.push(ml.join(''));

  // week lane
  const wl = ['<div class="axisrow week"><div></div><div class="lane">'];
  for (const s of weekSegs) wl.push(`<div class="w" style="left:${L(s.start + s.count / 2)}%">${esc(s.label)}</div>`);
  wl.push('</div><div></div></div>');
  p.push(wl.join(''));

  // chart: labels + plot
  p.push('<div class="chart"><div class="labels">');
  for (const r of rows) {
    const tag = r.tag ? ` <span class="tag">${esc(r.tag)}</span>` : '';
    p.push(`<div class="lab" style="height:${rowH}px"><div class="n">${esc(r.name)}${tag}</div>` +
      `<div class="o">${daysWord(r.total)} off</div></div>`);
  }
  p.push('</div>');

  const plot = [`<div class="plot" style="height:${plotH}px">`];
  for (const i of weekLines) plot.push(`<div class="grid-l" style="left:${L(i)}%"></div>`);
  for (const area of config.areas || []) {
    const s = idx(area.start), e = idx(area.end);
    if (s === null || e === null) continue;
    plot.push(`<div class="area" style="left:${L(s)}%;width:${W(e - s + 1)}%"></div>`);
  }
  for (const mk of markers) {
    const i = idx(mk.date);
    if (i === null) continue;
    const pos = i + 1 >= N ? 'right:0' : `left:${L(i + 1)}%`;
    plot.push(`<div class="mark" style="${pos};background:${markerColor.get(mk)};"></div>`);
  }
  rows.forEach((r, ri) => {
    for (const run of r.runs) {
      const w = run.end - run.start + 1;
      const top = ri * rowH + ((rowH - barH) >> 1);
      const tip = `${r.name} — ${fmt(days[run.start])} to ${fmt(days[run.end])} — ${daysWord(w)}`;
      plot.push(`<div class="bar" title="${esc(tip)}" ` +
        `style="left:${L(run.start)}%;width:${W(w)}%;top:${top}px"><span class="bl">${w}</span></div>`);
    }
  });
  plot.push('</div>');
  p.push(plot.join(''));

  // right column: per-member working days + % of business days worked
  p.push('<div class="rlabels">');
  for (const r of rows) {
    const tip = `${r.working} working days — ${pctOf(r.pct)} of ${N} business days`;
    p.push(`<div class="rlab" style="height:${rowH}px" title="${esc(tip)}">` +
      `<div class="rn">${r.working}</div><div class="ro">${pctOf(r.pct)}</div></div>`);
  }
  p.push('</div>');
  p.push('</div>'); // chart

  // bottom lane: area + marker labels
  const bl = ['<div class="axisrow bottom"><div></div><div class="lane">'];
  for (const area of config.areas || []) {
    const s = idx(area.start), e = idx(area.end);
    if (s === null || e === null) continue;
    bl.push(`<div class="blab area" style="left:${L(s + (e - s + 1) / 2)}%">${esc(area.label)}</div>`);
  }
  for (const mk of markers) {
    const i = idx(mk.date);
    if (i === null) continue;
    const c = markerColor.get(mk);
    const cls = 'blab mark' + (i + 1 >= N ? ' end' : '');
    const dl = mk.deadline ? ` data-deadline="${esc(mk.date)}"` : '';
    bl.push(`<div class="${cls}"${dl} style="left:${L(i + 1)}%;color:${c};border-color:${c};">${esc(mk.label)}</div>`);
  }
  bl.push('</div><div></div></div>');
  p.push(bl.join(''));

  // capacity row: per-day squad availability (100% = nobody out) + overall
  const capPlotH = 50, capBar = 32;
  const cap = [`<div class="chart caprow"><div class="lab caplab"><div class="n">Capacity</div>` +
    `<div class="o">100% = all in</div></div><div class="plot capplot" style="height:${capPlotH}px">`];
  cap.push('<div class="capbase"></div>');
  for (const seg of weekSegs) {
    let sum = 0;
    for (let j = 0; j < seg.count; j++) sum += capacity[seg.start + j];
    const c = seg.count ? sum / seg.count : 0;
    const mid = L(seg.start + seg.count / 2);
    cap.push(`<div class="capval" style="left:${mid}%">${pctOf(c)}</div>`);
    if (c > 0) {
      const tip = `${seg.label}: ${pctOf(c)} of the squad available`;
      cap.push(`<div class="cap" title="${esc(tip)}" ` +
        `style="left:${L(seg.start + 0.15)}%;width:${W(seg.count - 0.3)}%;height:${(c * capBar).toFixed(1)}px"></div>`);
    }
  }
  cap.push(`</div><div class="rlab capsum" title="${esc(`squad works ${pctOf(overall)} of the quarter's business days`)}">` +
    `<div class="rn">${pctOf(overall)}</div><div class="ro">avg</div></div></div>`);
  p.push(cap.join(''));

  p.push('</div>'); // card

  // footer
  const foot = ['<div class="foot">'];
  for (const w of warnings) foot.push(`<div class="warn">⚠ ${esc(w)}</div>`);
  foot.push('<div class="src">Source: HiBob' +
    (manual.length ? ' + manual additions' : '') +
    (generatedAt ? ` — generated ${esc(generatedAt)}` : '') + '.</div>');
  if (repo) {
    foot.push('<div class="make">Make your own — save the config below as config.json (edited for your group) and run:' +
      `<pre class="cmd">${esc(repo.command)}</pre>` +
      `<a href="${esc(repo.web)}">${esc(repo.web)}</a></div>`);
  }
  foot.push(`<details class="config"><summary>Config</summary><pre>${esc(JSON.stringify(config, null, 2))}</pre></details>`);
  foot.push('</div>');
  p.push(foot.join(''));

  p.push('</div>'); // wrap

  // "now" is computed in the browser at page load, so a saved chart stays current.
  p.push(nowScript(window, days.map(iso)));

  return p.join('\n') + '\n';
}

const HEAD = `<title>__TITLE__</title>
<style>
  :root{
    --ground:#f6f7f9; --surface:#fff; --ink:#1a2230; --ink-soft:#5a6576; --ink-faint:#8a94a4;
    --border:#e0e4ea; --grid:#e9edf2; --grid-strong:#ccd3dd; --timeoff:#3f6fd1; --cap:#8a6fb5;
    --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;
  }
  @media (prefers-color-scheme:dark){:root{
    --ground:#0f131a; --surface:#161c26; --ink:#e7ecf3; --ink-soft:#9aa6b6; --ink-faint:#6b7788;
    --border:#28313e; --grid:#222b37; --grid-strong:#33404f; --timeoff:#6f92e4; --cap:#ac93da;
  }}
  :root[data-theme="dark"]{
    --ground:#0f131a; --surface:#161c26; --ink:#e7ecf3; --ink-soft:#9aa6b6; --ink-faint:#6b7788;
    --border:#28313e; --grid:#222b37; --grid-strong:#33404f; --timeoff:#6f92e4; --cap:#ac93da;
  }
  :root[data-theme="light"]{
    --ground:#f6f7f9; --surface:#fff; --ink:#1a2230; --ink-soft:#5a6576; --ink-faint:#8a94a4;
    --border:#e0e4ea; --grid:#e9edf2; --grid-strong:#ccd3dd; --timeoff:#3f6fd1; --cap:#8a6fb5;
  }
  *{box-sizing:border-box;}
  body{background:var(--ground); color:var(--ink); font-family:var(--sans); line-height:1.5;
    -webkit-font-smoothing:antialiased; margin:0;}
  .wrap{max-width:1240px; width:100%; margin:0 auto; padding:40px 26px 60px;}
  .eyebrow{font-family:var(--mono); font-size:.72rem; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-faint);}
  h1{font-size:clamp(1.5rem,3vw,2rem); letter-spacing:-.02em; margin:.3em 0 .12em;}
  .sub{color:var(--ink-soft); margin:0; max-width:80ch; font-size:.92rem;}
  .card{background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:18px 20px; margin-top:20px;}
  .axisrow{display:grid; grid-template-columns:130px 1fr 76px;}
  .lane{position:relative; height:20px;}
  .axisrow.week .lane{height:16px;}
  .axisrow.bottom .lane{height:26px; margin-top:6px;}
  .m{position:absolute; top:0; transform:translateX(-50%); font-family:var(--mono); font-size:.72rem;
    letter-spacing:.06em; text-transform:uppercase; color:var(--ink-faint);}
  .medge{position:absolute; top:0; bottom:0; width:1px; background:var(--grid-strong);}
  .w{position:absolute; top:0; transform:translateX(-50%); font-family:var(--mono); font-size:.62rem;
    letter-spacing:.04em; color:var(--ink-faint); opacity:.85;}
  .chart{display:grid; grid-template-columns:130px 1fr 76px;}
  .labels{display:flex; flex-direction:column;}
  .lab{display:flex; flex-direction:column; justify-content:center;}
  .lab .n{font-weight:600; font-size:.9rem;}
  .lab .n .tag{font-weight:400; color:var(--ink-faint); font-size:.68rem; text-transform:uppercase; letter-spacing:.06em;}
  .lab .o{font-family:var(--mono); font-size:.66rem; color:var(--ink-faint);}
  .rhead{align-self:end; text-align:right; padding-right:2px; font-family:var(--mono); font-size:.62rem;
    letter-spacing:.04em; text-transform:uppercase; color:var(--ink-faint);}
  .rlabels{display:flex; flex-direction:column;}
  .rlab{display:flex; flex-direction:column; justify-content:center; align-items:flex-end; text-align:right; padding-right:2px;}
  .rlab .rn{font-weight:600; font-size:.9rem;}
  .rlab .ro{font-family:var(--mono); font-size:.66rem; color:var(--ink-faint);}
  .caprow{margin-top:6px; align-items:end;}
  .caplab{justify-content:flex-end;}
  .capplot{position:relative;}
  .capbase{position:absolute; left:0; right:0; bottom:0; height:1px; background:var(--border);}
  .capval{position:absolute; top:0; transform:translateX(-50%); font-family:var(--mono); font-size:.62rem; color:var(--ink-soft);}
  .cap{position:absolute; bottom:0; background:var(--cap); border-radius:2px 2px 0 0;}
  .capsum{justify-content:flex-end;}
  .capsum .rn{color:var(--cap);}
  .plot{position:relative;}
  .grid-l{position:absolute; top:0; bottom:0; width:1px; background:var(--grid);}
  .elapsed{position:absolute; top:0; bottom:0; left:0; background:color-mix(in srgb,var(--ink-soft) 7%,transparent);}
  .area{position:absolute; top:0; bottom:0; border-radius:4px;
    background:color-mix(in srgb,var(--ink-faint) 12%,transparent);
    border-left:1px dashed var(--ink-faint); border-right:1px dashed var(--ink-faint);}
  .mark{position:absolute; top:-4px; bottom:0; width:2px; z-index:6; background:var(--ink-soft);}
  .mark.now{width:0; background:none; border-left:2px dashed var(--ink-soft);}
  .bar{position:absolute; height:22px; border-radius:6px; display:flex; align-items:center; padding:0 6px;
    overflow:hidden; z-index:3; background:var(--timeoff);}
  .bar .bl{font-family:var(--mono); font-size:.63rem; font-weight:600; white-space:nowrap; color:#fff;}
  .blab{position:absolute; top:2px; transform:translateX(-50%); white-space:nowrap;
    font-family:var(--mono); font-size:.66rem; font-weight:600;}
  .blab.area{color:var(--ink-soft); border:1px solid var(--ink-faint); padding:2px 7px; border-radius:5px;}
  .blab.mark, .blab.now{color:var(--ink-soft);}
  .blab.end{transform:translateX(-100%);}
  .blab .cd{font-weight:400; opacity:.8;}
  .foot{margin-top:22px; font-size:.76rem; color:var(--ink-soft); font-family:var(--mono); display:flex; flex-direction:column; gap:4px;}
  .foot b{color:var(--ink);}
  .foot .warn{color:#b3413a;}
  .foot .src{color:var(--ink-faint); margin-top:4px;}
  .foot .make{margin-top:6px;}
  .foot .make .cmd{margin:8px 0; padding:10px 12px; background:var(--ground); border:1px solid var(--border);
    border-radius:8px; overflow-x:auto; color:var(--ink); white-space:pre;}
  .foot .make a{color:var(--timeoff);}
  .config summary{cursor:pointer; color:var(--ink-soft); width:fit-content;}
  .config pre{margin:8px 0 0; padding:12px 14px; background:var(--ground); border:1px solid var(--border);
    border-radius:8px; overflow-x:auto; font-size:.72rem; line-height:1.5; color:var(--ink);}
  @media (max-width:560px){ .wrap{padding:28px 14px;} .axisrow,.chart{grid-template-columns:84px 1fr 52px;} }
</style>
`;
