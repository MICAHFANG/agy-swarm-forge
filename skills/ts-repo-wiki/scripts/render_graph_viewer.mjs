/**
 * render_graph_viewer.mjs
 * Generates a self-contained, zero-CDN, offline interactive HTML architecture viewer
 * (.agents/wiki/_generated/graph-viewer.html) from compactGraph data.
 */

export function buildGraphViewerHtml({ repoName, compactGraph, moduleStats, moduleEdges }) {
  const payload = {
    repoName,
    generatedAt: compactGraph.generatedAt,
    parser: compactGraph.parser,
    totalFiles: compactGraph.totalFiles,
    modules: [...moduleStats.entries()].map(([name, st]) => ({
      name,
      files: st.files,
      components: st.components,
      hooks: st.hooks
    })),
    moduleEdges: [...moduleEdges.entries()].map(([key, weight]) => {
      const [from, to] = key.split('-->');
      return { from, to, weight };
    }),
    importedBy: compactGraph.importedBy,
    files: compactGraph.files
  };

  // Safe JSON embedding (prevent </script> injection)
  const safeJson = JSON.stringify(payload).replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${repoName} · Architecture Graph Viewer</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #E8F4F8;
    --panel: #F8F9FB;
    --card: #FFFFFF;
    --ink: #0F172A;
    --muted: #64748B;
    --line: #CBD5E1;
    --mint: #D8F1F8; --mint-ink: #0E7490;
    --cream: #FCF0C6; --cream-ink: #92400E;
    --lav: #EED8FC; --lav-ink: #6B21A8;
    --sage: #D9F3E4; --sage-ink: #065F46;
    --peach: #FCE1E4; --peach-ink: #BE123C;
  }
  html, body {
    height: 100%; background: var(--bg); color: var(--ink);
    font-family: "SF Pro Display", "PingFang SC", -apple-system, BlinkMacSystemFont, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: "SF Mono", "JetBrains Mono", Menlo, Monaco, monospace; }
  .shell {
    display: flex; flex-direction: column; height: 100vh; padding: 14px; gap: 12px;
  }
  .topbar {
    background: #0E1015; color: #F8FAFC; border-radius: 20px; padding: 12px 22px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    box-shadow: 0 12px 32px rgba(15,23,42,0.14); flex-shrink: 0;
  }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 16px; }
  .tabs { display: flex; gap: 8px; }
  .tab {
    border: 0; background: transparent; color: #94A3B8; padding: 8px 16px; border-radius: 999px;
    font-size: 14px; font-weight: 600; cursor: pointer; transition: all .15s;
  }
  .tab:hover { color: #FFFFFF; background: rgba(255,255,255,0.08); }
  .tab.active { background: #FFFFFF; color: #0F172A; }
  .search-box {
    display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.14); border-radius: 12px; padding: 7px 14px; min-width: 280px;
  }
  .search-box input {
    background: transparent; border: 0; outline: none; color: #FFFFFF; font-size: 14px; width: 100%;
  }
  .search-box input::placeholder { color: #94A3B8; }

  .workspace {
    flex: 1; min-height: 0; display: flex; gap: 14px;
  }
  .main {
    flex: 1; min-width: 0; background: var(--panel); border-radius: 24px;
    border: 1.5px solid rgba(15,23,42,0.06);
    box-shadow: 0 18px 42px rgba(100,116,139,0.12);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .subbar {
    padding: 14px 22px; border-bottom: 1px solid rgba(15,23,42,0.06);
    display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  }
  .stat-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px;
    font-size: 12px; font-weight: 700;
  }
  .canvas-area {
    flex: 1; overflow: auto; padding: 24px; position: relative;
  }

  /* Right Inspector Drawer */
  .inspector {
    width: 380px; flex-shrink: 0; background: #F1F3F6; border-radius: 24px;
    border: 1.5px solid rgba(15,23,42,0.06); padding: 20px;
    display: flex; flex-direction: column; gap: 14px; overflow-y: auto;
  }
  .insp-card {
    background: #FFFFFF; border-radius: 18px; padding: 16px;
    border: 1px solid rgba(15,23,42,0.06);
    box-shadow: 0 8px 22px rgba(100,116,139,0.1);
  }
  .insp-title { font-size: 13px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 10px; }

  /* L1 Module Topology */
  .topo-wrap { position: relative; min-height: 460px; }
  .topo-svg { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
  .topo-cols { display: flex; gap: 76px; align-items: flex-start; position: relative; z-index: 2; }
  .topo-col { display: flex; flex-direction: column; gap: 18px; min-width: 230px; }
  .col-label { font-size: 12px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .8px; padding-left: 6px; }
  .mod-card {
    background: #FFFFFF; border-radius: 20px; overflow: hidden; cursor: pointer;
    border: 1.5px solid rgba(15,23,42,0.07);
    box-shadow: 0 12px 28px rgba(100,116,139,0.12);
    transition: transform .15s, box-shadow .15s, opacity .15s;
  }
  .mod-card:hover { transform: translateY(-3px); box-shadow: 0 18px 36px rgba(15,23,42,0.14); }
  .mod-card.selected { border-color: #0EA5E9; box-shadow: 0 0 0 3px rgba(14,165,233,0.22); }
  .mod-card.dim { opacity: 0.28; }
  .mod-body { padding: 14px 16px; }
  .mod-name { font-size: 15px; font-weight: 800; color: var(--ink); word-break: break-all; }
  .mod-meta { font-size: 12px; color: var(--muted); margin-top: 6px; display: flex; gap: 10px; }
  .mod-rib { padding: 7px 14px; font-size: 12px; font-weight: 700; display: flex; justify-content: space-between; }

  /* L2 Blast Radius 3-Column View */
  .blast-grid { display: grid; grid-template-columns: 1fr 1.15fr 1fr; gap: 28px; align-items: start; }
  .blast-col { display: flex; flex-direction: column; gap: 10px; }
  .file-chip {
    background: #FFFFFF; border: 1.5px solid rgba(15,23,42,0.07); border-radius: 14px;
    padding: 11px 14px; cursor: pointer; font-size: 13px; color: var(--ink);
    box-shadow: 0 6px 16px rgba(100,116,139,0.09); transition: all .14s;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }
  .file-chip:hover { border-color: #38BDF8; transform: translateX(2px); }
  .focus-card {
    background: #FFFFFF; border-radius: 24px; overflow: hidden;
    border: 2px solid #0EA5E9;
    box-shadow: 0 24px 52px rgba(14,165,233,0.16);
  }

  /* L3 Component Gallery */
  .comp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 18px; }
  .comp-card {
    background: #FFFFFF; border-radius: 20px; overflow: hidden; cursor: pointer;
    border: 1.5px solid rgba(15,23,42,0.07);
    box-shadow: 0 12px 26px rgba(100,116,139,0.11); transition: transform .15s;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .comp-card:hover { transform: translateY(-3px); border-color: #818CF8; }
  .prop-chip {
    display: inline-block; font-size: 12px; padding: 4px 9px; border-radius: 8px;
    background: #F1F5F9; color: #334155; margin: 3px 4px 3px 0;
  }
  .prop-chip.variant { background: var(--lav); color: var(--lav-ink); font-weight: 700; }
  .btn-sm {
    border: 1px solid #CBD5E1; background: #FFFFFF; color: var(--ink); border-radius: 10px;
    padding: 5px 11px; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .btn-sm:hover { background: #F1F5F9; }
</style>
</head>
<body>
<div class="shell">
  <div class="topbar">
    <div class="brand">
      <svg width="24" height="24" viewBox="0 0 256 256" fill="none">
        <polygon points="128,28 214,78 214,178 128,228 42,178 42,78" stroke="#7DD3FC" stroke-width="18" fill="#1E293B"/>
        <circle cx="128" cy="74" r="20" fill="#7DD3FC"/><circle cx="80" cy="154" r="20" fill="#C4B5FD"/><circle cx="176" cy="154" r="20" fill="#6EE7B7"/>
        <polygon points="128,104 149,116 149,140 128,152 107,140 107,116" fill="#FDBA74"/>
      </svg>
      <span class="mono" id="repo-title"></span>
      <span class="pill" style="background:rgba(255,255,255,0.12);color:#CBD5E1;">Graph Viewer</span>
    </div>
    <div class="tabs">
      <button class="tab active" data-view="topology">L1 模块拓扑</button>
      <button class="tab" data-view="blast">L2 爆炸半径</button>
      <button class="tab" data-view="components">L3 组件变体库</button>
    </div>
    <div class="search-box">
      <span>🔍</span>
      <input id="search" type="text" placeholder="搜索组件 / Hook / 文件路径..." />
    </div>
  </div>

  <div class="workspace">
    <div class="main">
      <div class="subbar">
        <div class="stat-row" id="stats-bar"></div>
        <div class="stat-row">
          <span class="mono" style="font-size:12px;color:var(--muted);" id="meta-info"></span>
          <button class="btn-sm" id="reset-btn">重置聚焦</button>
        </div>
      </div>
      <div class="canvas-area" id="canvas"></div>
    </div>

    <div class="inspector" id="inspector"></div>
  </div>
</div>

<script id="graph-data" type="application/json">${safeJson}</script>
<script>
const DATA = JSON.parse(document.getElementById('graph-data').textContent);
const VARIANT_RE = /^(variant|variants|size|intent|tone|color|theme|mode|kind|type|status|appearance|shape|layout|align|placement|asChild|render\\w+|slot\\w*|icon\\w*|footer|header|extra)$/i;

let currentView = 'topology';
let searchQuery = '';
let selectedModule = null;
let selectedFile = null;

// Precompute file list sorted by Fan-In
const allFilePaths = Object.keys(DATA.files).sort((a, b) => (DATA.importedBy[b]?.length || 0) - (DATA.importedBy[a]?.length || 0) || a.localeCompare(b));
if (allFilePaths.length > 0) selectedFile = allFilePaths[0];

// Detect circular module edges (A -> B and B -> A)
const edgeSet = new Set(DATA.moduleEdges.map(e => e.from + '-->' + e.to));
const circularEdges = new Set();
for (const e of DATA.moduleEdges) {
  if (edgeSet.has(e.to + '-->' + e.from)) {
    circularEdges.add(e.from + '-->' + e.to);
  }
}

document.getElementById('repo-title').textContent = DATA.repoName;
document.getElementById('meta-info').textContent = DATA.parser + ' · ' + (DATA.generatedAt || '').slice(0, 16).replace('T', ' ');

function renderStats() {
  const totalComps = Object.values(DATA.files).reduce((s, f) => s + (f.components?.length || 0), 0);
  const totalHooks = Object.values(DATA.files).reduce((s, f) => s + (f.hooks?.length || 0), 0);
  const circCount = circularEdges.size / 2;
  document.getElementById('stats-bar').innerHTML = [
    '<span class="pill" style="background:var(--mint);color:var(--mint-ink);">📄 ' + DATA.totalFiles + ' 源码文件</span>',
    '<span class="pill" style="background:var(--lav);color:var(--lav-ink);">🧩 ' + totalComps + ' UI 组件</span>',
    '<span class="pill" style="background:var(--sage);color:var(--sage-ink);">🪝 ' + totalHooks + ' Hooks</span>',
    '<span class="pill" style="background:var(--cream);color:var(--cream-ink);">📦 ' + DATA.modules.length + ' 模块</span>',
    circCount > 0 ? '<span class="pill" style="background:var(--peach);color:var(--peach-ink);">⚠ ' + circCount + ' 处模块双向循环依赖</span>' : '<span class="pill" style="background:var(--sage);color:var(--sage-ink);">✓ 零模块循环依赖</span>'
  ].join('');
}

function getBucket(rel) {
  const p = rel.split('/');
  if (p[0] === 'packages' && p.length >= 3) return p[0] + '/' + p[1] + '/' + p[2];
  if ((p[0] === 'src' || p[0] === 'app') && p.length >= 2) return p[0] + '/' + p[1];
  return p.length >= 2 ? p[0] : 'root';
}

function renderTopology() {
  const canvas = document.getElementById('canvas');
  const q = searchQuery.toLowerCase();
  const mods = DATA.modules.filter(m => !q || m.name.toLowerCase().includes(q));
  if (mods.length === 0) {
    canvas.innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center;">未匹配到模块目录</div>';
    return;
  }

  // Compute in/out degree to sort modules into 3 intuitive architectural columns:
  // Col 0: Entry / Features (out > in), Col 1: Mid / Components, Col 2: Core Foundations (in > out)
  const inDeg = {}, outDeg = {};
  for (const m of mods) { inDeg[m.name] = 0; outDeg[m.name] = 0; }
  for (const e of DATA.moduleEdges) {
    if (outDeg[e.from] !== undefined) outDeg[e.from] += e.weight;
    if (inDeg[e.to] !== undefined) inDeg[e.to] += e.weight;
  }

  const cols = [[], [], []];
  for (const m of mods) {
    const inp = inDeg[m.name] || 0, out = outDeg[m.name] || 0;
    if (out > inp && inp <= 2) cols[0].push(m);
    else if (inp > out) cols[2].push(m);
    else cols[1].push(m);
  }
  const colTitles = ['应用入口 / 业务域 (Callers)', '中间模块 / 页面组件 (Bridge)', '底层底座 / 共享枢纽 (Core Hubs)'];
  const colRibs = [
    ['var(--mint)', 'var(--mint-ink)'],
    ['var(--lav)', 'var(--lav-ink)'],
    ['var(--cream)', 'var(--cream-ink)']
  ];

  const connectedSet = new Set();
  if (selectedModule) {
    connectedSet.add(selectedModule);
    for (const e of DATA.moduleEdges) {
      if (e.from === selectedModule) connectedSet.add(e.to);
      if (e.to === selectedModule) connectedSet.add(e.from);
    }
  }

  canvas.innerHTML = '<div class="topo-wrap" id="topo-wrap"><svg class="topo-svg" id="topo-svg"></svg><div class="topo-cols">' +
    cols.map((list, ci) => {
      if (list.length === 0) return '';
      return '<div class="topo-col"><div class="col-label">' + colTitles[ci] + '</div>' +
        list.sort((a, b) => (inDeg[b.name] + outDeg[b.name]) - (inDeg[a.name] + outDeg[a.name])).map(m => {
          const isSel = selectedModule === m.name;
          const isDim = selectedModule && !connectedSet.has(m.name);
          const hasCirc = [...circularEdges].some(k => k.startsWith(m.name + '-->'));
          return '<div class="mod-card ' + (isSel ? 'selected' : '') + (isDim ? ' dim' : '') + '" data-mod="' + m.name + '">' +
            '<div class="mod-body">' +
              '<div class="mod-name mono">' + m.name + (hasCirc ? ' <span style="color:#BE123C;">⚠</span>' : '') + '</div>' +
              '<div class="mod-meta"><span>📄 ' + m.files + '</span><span>🧩 ' + m.components + '</span><span>🪝 ' + m.hooks + '</span></div>' +
            '</div>' +
            '<div class="mod-rib" style="background:' + colRibs[ci][0] + ';color:' + colRibs[ci][1] + ';">' +
              '<span>入度 ' + (inDeg[m.name] || 0) + '</span><span>出度 ' + (outDeg[m.name] || 0) + '</span>' +
            '</div></div>';
        }).join('') + '</div>';
    }).join('') + '</div></div>';

  canvas.querySelectorAll('.mod-card').forEach(el => {
    el.onclick = () => {
      const m = el.getAttribute('data-mod');
      selectedModule = selectedModule === m ? null : m;
      renderAll();
    };
  });

  // Draw crisp cubic Bezier SVG edges between module cards
  requestAnimationFrame(() => {
    const wrap = document.getElementById('topo-wrap');
    const svg = document.getElementById('topo-svg');
    if (!wrap || !svg) return;
    const wr = wrap.getBoundingClientRect();
    svg.setAttribute('width', wrap.scrollWidth);
    svg.setAttribute('height', wrap.scrollHeight);

    const pos = {};
    wrap.querySelectorAll('.mod-card').forEach(el => {
      const r = el.getBoundingClientRect();
      pos[el.getAttribute('data-mod')] = {
        x: r.left - wr.left, y: r.top - wr.top, w: r.width, h: r.height
      };
    });

    const lines = [];
    for (const e of DATA.moduleEdges) {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) continue;
      const isCirc = circularEdges.has(e.from + '-->' + e.to);
      const active = !selectedModule || e.from === selectedModule || e.to === selectedModule;
      const opacity = active ? (isCirc ? 0.9 : 0.65) : 0.10;
      const stroke = isCirc ? '#E11D48' : (e.from === selectedModule ? '#0EA5E9' : '#64748B');
      const sw = Math.min(5, 1.5 + Math.log2(e.weight + 1));

      const x1 = a.x + (a.x <= b.x ? a.w : 0);
      const y1 = a.y + a.h / 2;
      const x2 = b.x + (a.x <= b.x ? 0 : b.w);
      const y2 = b.y + b.h / 2;
      const dx = Math.max(48, Math.abs(x2 - x1) * 0.45);
      const c1x = a.x <= b.x ? x1 + dx : x1 - dx;
      const c2x = a.x <= b.x ? x2 - dx : x2 + dx;

      lines.push('<path d="M' + x1 + ',' + y1 + ' C' + c1x + ',' + y1 + ' ' + c2x + ',' + y2 + ' ' + x2 + ',' + y2 + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw.toFixed(1) + '" stroke-opacity="' + opacity + '"' + (isCirc ? ' stroke-dasharray="6 4"' : '') + '/>');
      if (active) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 4;
        lines.push('<rect x="' + (mx - 13) + '" y="' + (my - 10) + '" width="26" height="18" rx="9" fill="' + (isCirc ? '#FCE1E4' : '#FFFFFF') + '" stroke="' + stroke + '" stroke-width="1"/>');
        lines.push('<text x="' + mx + '" y="' + (my + 3) + '" text-anchor="middle" font-size="10" font-weight="700" fill="' + stroke + '">' + e.weight + '</text>');
      }
    }
    svg.innerHTML = lines.join('');
  });
}

function renderBlast() {
  const canvas = document.getElementById('canvas');
  const q = searchQuery.toLowerCase();
  const matched = allFilePaths.filter(p => !q || p.toLowerCase().includes(q));
  if (q && matched.length > 0 && !matched.includes(selectedFile)) selectedFile = matched[0];
  if (!selectedFile || !DATA.files[selectedFile]) {
    canvas.innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center;">未找到匹配文件</div>';
    return;
  }

  const rec = DATA.files[selectedFile];
  const callers = DATA.importedBy[selectedFile] || [];
  const deps = rec.deps || [];

  canvas.innerHTML = '<div class="blast-grid">' +
    '<div class="blast-col"><div class="col-label">⬅ 上游调用方 / 爆炸半径 (' + callers.length + ')</div>' +
      (callers.length === 0 ? '<div class="insp-card" style="color:var(--muted);font-size:13px;">无上游直接引用（叶子入口文件）</div>' :
        callers.map(c => '<div class="file-chip mono" data-file="' + c + '"><span>' + c + '</span><span style="color:var(--mint-ink);">→</span></div>').join('')) +
    '</div>' +

    '<div class="blast-col"><div class="col-label">🎯 当前聚焦文件</div>' +
      '<div class="focus-card">' +
        '<div style="padding:18px 20px;">' +
          '<div class="mono" style="font-size:16px;font-weight:800;word-break:break-all;margin-bottom:10px;">' + selectedFile + '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
            '<span class="pill" style="background:var(--peach);color:var(--peach-ink);">被引用 ' + callers.length + ' 次</span>' +
            '<span class="pill" style="background:var(--mint);color:var(--mint-ink);">依赖 ' + deps.length + ' 个文件</span>' +
          '</div>' +
          (rec.components?.length ? '<div style="margin-bottom:12px;"><div class="insp-title">UI 组件与变体</div>' + rec.components.map(c => {
            const propsHtml = (c.props || []).map(p => '<span class="prop-chip mono ' + (VARIANT_RE.test(p.name) || p.type.includes("'") ? 'variant' : '') + '">' + p.name + (p.optional ? '?' : '') + ': ' + p.type + '</span>').join('');
            return '<div style="margin-bottom:8px;"><b class="mono">' + c.name + '</b><div>' + (propsHtml || '<span style="font-size:12px;color:var(--muted);">无显式 Props</span>') + '</div></div>';
          }).join('') + '</div>' : '') +
          (rec.hooks?.length ? '<div style="margin-bottom:10px;"><div class="insp-title">Hooks</div>' + rec.hooks.map(h => '<span class="prop-chip mono" style="background:var(--sage);color:var(--sage-ink);">' + h + '</span>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="mod-rib" style="background:var(--mint);color:var(--mint-ink);"><span>模块：' + getBucket(selectedFile) + '</span><span>点击左右节点可继续追踪</span></div>' +
      '</div>' +
    '</div>' +

    '<div class="blast-col"><div class="col-label">下游依赖文件 (' + deps.length + ') ➡</div>' +
      (deps.length === 0 ? '<div class="insp-card" style="color:var(--muted);font-size:13px;">无内部源码依赖（纯底座模块）</div>' :
        deps.map(d => '<div class="file-chip mono" data-file="' + d + '"><span>' + d + '</span><span style="color:var(--lav-ink);">→</span></div>').join('')) +
    '</div>' +
  '</div>';

  canvas.querySelectorAll('.file-chip').forEach(el => {
    el.onclick = () => { selectedFile = el.getAttribute('data-file'); renderAll(); };
  });
}

function renderComponents() {
  const canvas = document.getElementById('canvas');
  const q = searchQuery.toLowerCase();
  const items = [];
  for (const [rel, rec] of Object.entries(DATA.files)) {
    const fanIn = DATA.importedBy[rel]?.length || 0;
    for (const c of (rec.components || [])) {
      const hay = (c.name + ' ' + rel + ' ' + (c.props || []).map(p => p.name + ' ' + p.type).join(' ')).toLowerCase();
      if (!q || hay.includes(q)) items.push({ name: c.name, rel, fanIn, props: c.props || [] });
    }
  }
  items.sort((a, b) => b.fanIn - a.fanIn || a.name.localeCompare(b.name));

  if (items.length === 0) {
    canvas.innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center;">未匹配到 UI 组件（可在 L1/L2 查看普通 TS 模块）</div>';
    return;
  }

  canvas.innerHTML = '<div class="comp-grid">' + items.map(it => {
    const vProps = it.props.filter(p => VARIANT_RE.test(p.name) || p.type.includes("'"));
    const oProps = it.props.filter(p => !vProps.includes(p)).slice(0, 5);
    return '<div class="comp-card" data-file="' + it.rel + '">' +
      '<div style="padding:18px 20px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<b class="mono" style="font-size:18px;">' + it.name + '</b>' +
          '<span class="pill" style="background:var(--cream);color:var(--cream-ink);">复用 ' + it.fanIn + ' 次</span>' +
        '</div>' +
        '<div class="mono" style="font-size:12px;color:var(--muted);margin-bottom:10px;word-break:break-all;">' + it.rel + '</div>' +
        '<div>' +
          vProps.map(p => '<span class="prop-chip variant mono">' + p.name + (p.optional ? '?' : '') + ': ' + p.type + '</span>').join('') +
          oProps.map(p => '<span class="prop-chip mono">' + p.name + '</span>').join('') +
        '</div>' +
      '</div>' +
      '<div class="mod-rib" style="background:var(--lav);color:var(--lav-ink);"><span>点击查看爆炸半径</span><span>→</span></div>' +
    '</div>';
  }).join('') + '</div>';

  canvas.querySelectorAll('.comp-card').forEach(el => {
    el.onclick = () => {
      selectedFile = el.getAttribute('data-file');
      currentView = 'blast';
      syncTabs();
      renderAll();
    };
  });
}

function renderInspector() {
  const insp = document.getElementById('inspector');
  const topHubs = allFilePaths.slice(0, 12);
  let modFilesHtml = '';
  if (selectedModule) {
    const mFiles = allFilePaths.filter(p => getBucket(p) === selectedModule);
    modFilesHtml = '<div class="insp-card"><div class="insp-title">📦 模块内文件 (' + selectedModule + ' · ' + mFiles.length + ')</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;">' +
      mFiles.map(f => '<div class="file-chip mono" style="padding:7px 10px;font-size:12px;" data-jump="' + f + '"><span>' + f.replace(selectedModule + '/', '') + '</span><span style="color:var(--muted);">' + (DATA.importedBy[f]?.length || 0) + '</span></div>').join('') +
      '</div></div>';
  }

  insp.innerHTML =
    modFilesHtml +
    '<div class="insp-card"><div class="insp-title">🔥 高频核心底座 (Top Fan-In)</div>' +
      '<div style="display:flex;flex-direction:column;gap:7px;">' +
      topHubs.map(f => '<div class="file-chip mono" style="padding:8px 11px;font-size:12px;' + (f === selectedFile ? 'border-color:#0EA5E9;background:#F0F9FF;' : '') + '" data-jump="' + f + '"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + f + '</span><span class="pill" style="background:var(--mint);color:var(--mint-ink);padding:2px 8px;">' + (DATA.importedBy[f]?.length || 0) + '</span></div>').join('') +
      '</div></div>';

  insp.querySelectorAll('[data-jump]').forEach(el => {
    el.onclick = () => {
      selectedFile = el.getAttribute('data-jump');
      currentView = 'blast';
      syncTabs();
      renderAll();
    };
  });
}

function syncTabs() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-view') === currentView));
}

function renderAll() {
  renderStats();
  if (currentView === 'topology') renderTopology();
  else if (currentView === 'blast') renderBlast();
  else renderComponents();
  renderInspector();
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => { currentView = btn.getAttribute('data-view'); syncTabs(); renderAll(); };
});
document.getElementById('search').addEventListener('input', e => { searchQuery = e.target.value.trim(); renderAll(); });
document.getElementById('reset-btn').onclick = () => { selectedModule = null; searchQuery = ''; document.getElementById('search').value = ''; renderAll(); };

renderAll();
</script>
</body>
</html>`;
}
