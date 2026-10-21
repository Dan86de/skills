#!/usr/bin/env node
// map.mjs: check, outline and render a map file (a tree of nodes with cross-links)
// into one self-contained, interactive HTML page.
//
// Zero dependencies. Node 18 or newer.
//
//   node map.mjs check   <map.json>
//   node map.mjs outline <map.json>
//   node map.mjs render  <map.json> [--out <file.html>]
//
// The format is documented in ../references/map-format.md.

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

const DEFAULT_STATES = {
  open: { label: "Not explored yet", mark: "hollow", tone: "text" },
  suggested: { label: "Suggested", mark: "filled", tone: "accent" },
};
const MARKS = ["filled", "hollow", "ring", "dashed", "cross"];
const TONES = ["text", "muted", "accent", "ok", "warn", "danger"];
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function load(file) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (e) {
    fail(`error: cannot read ${file}: ${e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`error: ${file} is not valid JSON: ${e.message}`);
  }
}

export function check(map) {
  const errors = [];
  const warnings = [];
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return { errors: ["the file must hold a JSON object"], warnings };
  }
  if (typeof map.title !== "string" || !map.title.trim()) errors.push("`title` is required");
  if (map.lens !== undefined && typeof map.lens !== "string") errors.push("`lens` must be a string");

  const states = { ...DEFAULT_STATES };
  if (map.states !== undefined) {
    if (typeof map.states !== "object" || Array.isArray(map.states)) {
      errors.push("`states` must be an object keyed by state name");
    } else {
      for (const [name, s] of Object.entries(map.states)) {
        if (!s || typeof s !== "object") {
          errors.push(`state "${name}" must be an object`);
          continue;
        }
        if (typeof s.label !== "string") errors.push(`state "${name}" needs a \`label\``);
        if (s.mark !== undefined && !MARKS.includes(s.mark))
          errors.push(`state "${name}": mark must be one of ${MARKS.join(", ")}`);
        if (s.tone !== undefined && !TONES.includes(s.tone))
          errors.push(`state "${name}": tone must be one of ${TONES.join(", ")}`);
        states[name] = s;
      }
    }
  }

  if (!Array.isArray(map.nodes) || map.nodes.length === 0) {
    errors.push("`nodes` must be a non-empty array");
    return { errors, warnings };
  }

  const byId = new Map();
  map.nodes.forEach((n, i) => {
    const where = n && typeof n.id === "string" ? `node "${n.id}"` : `nodes[${i}]`;
    if (!n || typeof n !== "object") return errors.push(`${where} must be an object`);
    if (typeof n.id !== "string" || !ID_RE.test(n.id))
      errors.push(`${where}: \`id\` must be lowercase kebab-case (a-z, 0-9, -)`);
    else if (byId.has(n.id)) errors.push(`${where}: duplicate id`);
    else byId.set(n.id, n);
    if (typeof n.label !== "string" || !n.label.trim()) errors.push(`${where}: \`label\` is required`);
    else if (n.label.length > 40) warnings.push(`${where}: label is ${n.label.length} chars, keep it under 40`);
    if (n.state !== undefined && !(n.state in states))
      errors.push(`${where}: unknown state "${n.state}" (known: ${Object.keys(states).join(", ")})`);
    for (const k of ["summary", "body", "ask"])
      if (n[k] !== undefined && typeof n[k] !== "string") errors.push(`${where}: \`${k}\` must be a string`);
    if (n.links !== undefined && !Array.isArray(n.links)) errors.push(`${where}: \`links\` must be an array of ids`);
    if (n.sources !== undefined) {
      if (!Array.isArray(n.sources)) errors.push(`${where}: \`sources\` must be an array`);
      else
        n.sources.forEach((s, j) => {
          if (!s || typeof s.url !== "string" || !/^https?:\/\//.test(s.url))
            errors.push(`${where}: sources[${j}] needs an http(s) \`url\``);
        });
    }
  });

  const roots = map.nodes.filter((n) => n && (n.parent === null || n.parent === undefined));
  if (roots.length !== 1)
    errors.push(`exactly one node must have no parent (the centre), found ${roots.length}`);

  const children = new Map();
  for (const n of map.nodes) {
    if (!n || n.parent === null || n.parent === undefined) continue;
    if (!byId.has(n.parent)) {
      errors.push(`node "${n.id}": parent "${n.parent}" does not exist`);
      continue;
    }
    if (!children.has(n.parent)) children.set(n.parent, []);
    children.get(n.parent).push(n.id);
  }

  // cycles
  for (const n of byId.values()) {
    const seen = new Set();
    let cur = n;
    while (cur && cur.parent != null) {
      if (seen.has(cur.id)) {
        errors.push(`node "${n.id}": parent chain loops back on itself`);
        break;
      }
      seen.add(cur.id);
      cur = byId.get(cur.parent);
    }
  }

  let links = 0;
  for (const n of byId.values()) {
    if (!Array.isArray(n.links)) continue;
    for (const l of n.links) {
      if (l === n.id) errors.push(`node "${n.id}": links to itself`);
      else if (!byId.has(l)) errors.push(`node "${n.id}": link to unknown id "${l}"`);
      else links++;
    }
  }

  for (const [id, kids] of children)
    if (kids.length > 9) warnings.push(`node "${id}" has ${kids.length} children, split it or group them`);
  for (const n of byId.values())
    if (n.parent != null && !n.summary && !n.body)
      warnings.push(`node "${n.id}" has neither summary nor body, the panel will be empty`);

  let depth = 0;
  if (!errors.length && roots.length === 1) {
    const walk = (id, d) => {
      depth = Math.max(depth, d);
      for (const c of children.get(id) || []) walk(c, d + 1);
    };
    walk(roots[0].id, 0);
    if (depth > 5) warnings.push(`the tree is ${depth} levels deep, consider starting a new map from a deep node`);
  }

  const stats = {
    nodes: byId.size,
    branches: roots.length === 1 ? (children.get(roots[0].id) || []).length : 0,
    depth,
    links,
  };
  return { errors, warnings, stats, states, children, byId, root: roots[0] };
}

function report(result, file) {
  for (const w of result.warnings) console.error(`warn: ${w}`);
  if (result.errors.length) {
    for (const e of result.errors) console.error(`error: ${e}`);
    fail(`${file}: ${result.errors.length} error(s)`);
  }
}

function outline(map, result) {
  const lines = [`${map.title}${map.lens ? `  (${map.lens})` : ""}`];
  const walk = (id, indent) => {
    for (const c of result.children.get(id) || []) {
      const n = result.byId.get(c);
      const tag = n.state ? ` [${n.state}]` : "";
      const links = n.links?.length ? `  -> ${n.links.join(", ")}` : "";
      lines.push(`${"  ".repeat(indent)}- ${n.label} (${n.id})${tag}${links}`);
      walk(c, indent + 1);
    }
  };
  walk(result.root.id, 0);
  return lines.join("\n");
}

function render(map, result) {
  const data = JSON.stringify({ ...map, states: result.states })
    .replace(/</g, "\\u003c")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
  const title = String(map.title).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return TEMPLATE.replace("%%TITLE%%", title).replace("%%DATA%%", () => data);
}

// ---------------------------------------------------------------------------

const TEMPLATE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%%TITLE%%</title>
<style>
@font-face { font-family: "Geomanist"; font-weight: 400; src: local("Geomanist Regular"), local("Geomanist-Regular"), local("Geomanist"); }
@font-face { font-family: "Geomanist"; font-weight: 500; src: local("Geomanist Medium"), local("Geomanist-Medium"); }
@font-face { font-family: "Silka Mono"; font-weight: 300; src: local("Silka Mono Light"), local("SilkaMono-Light"), local("Silka Mono"); }
:root {
  --bg: #171717; --panel: #1E1E1E; --line: #333333; --line-strong: #6B6B6B;
  --text: #FAFAFA; --muted: #A3A3A3; --faint: #4A4A4A; --soft: #D4D4D8;
  --accent: #F25118; --accent-grad: linear-gradient(135deg, #F15613, #F27B13);
  --ok: #FAFAFA; --warn: #F27B13; --danger: #EF4444;
  --hl: rgba(242,81,24,.12); --hover: rgba(255,255,255,.05); --shadow: 0 12px 40px rgba(0,0,0,.55);
  --geo: "Geomanist", "Outfit", system-ui, -apple-system, "Segoe UI", sans-serif;
  --body: "Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "Silka Mono", "DM Mono", ui-monospace, "JetBrains Mono", Menlo, monospace;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --bg: #FAFAFA; --panel: #FFFFFF; --line: #DDDDDD; --line-strong: #8A8A8A;
    --text: #171717; --muted: #6B6B6B; --faint: #C4C4C4; --soft: #3F3F46;
    --ok: #171717; --warn: #C2410C; --danger: #DC2626;
    --hl: rgba(242,81,24,.10); --hover: rgba(0,0,0,.04); --shadow: 0 12px 40px rgba(0,0,0,.10);
  }
}
:root[data-theme="light"] {
  --bg: #FAFAFA; --panel: #FFFFFF; --line: #DDDDDD; --line-strong: #8A8A8A;
    --text: #171717; --muted: #6B6B6B; --faint: #C4C4C4; --soft: #3F3F46;
    --ok: #171717; --warn: #C2410C; --danger: #DC2626;
    --hl: rgba(242,81,24,.10); --hover: rgba(0,0,0,.04); --shadow: 0 12px 40px rgba(0,0,0,.10);
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font: 14px/1.55 var(--body); }
#stage { position: fixed; inset: 0; overflow: hidden; cursor: grab; touch-action: none; }
#stage.dragging { cursor: grabbing; }
svg { display: block; width: 100%; height: 100%; }
.edge { fill: none; stroke: var(--line); stroke-width: 1; }
.edge.on { stroke: var(--accent); stroke-width: 1.4; }
.xlink { fill: none; stroke: var(--faint); stroke-width: 1; stroke-dasharray: 2 5; stroke-linecap: round; }
.xlink.on { stroke: var(--accent); stroke-width: 1.2; }
.node { cursor: pointer; }
.node text { fill: var(--muted); font-family: var(--geo); font-size: 13px; font-weight: 400; }
.node.root text { fill: var(--text); font-size: 19px; font-weight: 500; letter-spacing: .01em; }
.node.on text, .node:hover text { fill: var(--text); }
.node.sel text { fill: var(--accent); font-weight: 500; }
.node .pill { fill: transparent; }
.node:hover .pill { fill: var(--hover); }
.node.sel .pill { fill: var(--hl); }
.node .more { fill: var(--accent); font-family: var(--mono); font-size: 10.5px; }
.dot { stroke-width: 1.3; }
#hdr { position: fixed; left: 24px; top: 20px; right: 24px; pointer-events: none; }
#hdr .kicker { font: 300 10.5px/1 var(--mono); text-transform: uppercase; letter-spacing: .12em; color: var(--accent); }
#hdr h1 { margin: 8px 0 0; font: 500 22px/1.1 var(--geo); letter-spacing: .01em; }
#hdr .lens { margin-top: 4px; color: var(--muted); font-style: italic; font-size: 13px; }
#sig { position: fixed; right: 24px; bottom: 22px; font: 300 10px/1 var(--mono); letter-spacing: .1em; color: var(--muted); text-transform: uppercase; pointer-events: none; }
#sig b { color: var(--accent); font-weight: 300; }
#panel { position: fixed; top: 16px; right: 16px; bottom: 16px; width: 360px; max-width: calc(100vw - 32px);
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px; box-shadow: var(--shadow);
  padding: 22px 22px 18px; overflow-y: auto; display: none; z-index: 2; }
#panel.open { display: block; }
#panel .state { font: 300 10.5px/1 var(--mono); text-transform: uppercase; letter-spacing: .12em; color: var(--accent); margin-bottom: 10px; min-height: 10px; }
#panel h2 { margin: 0 28px 12px 0; font: 500 21px/1.15 var(--geo); }
#panel .summary { color: var(--text); font-size: 15px; margin: 0 0 12px; }
#panel .body { color: var(--soft); }
#panel .body p { margin: 0 0 10px; }
#panel .body b { color: var(--text); }
#panel .body ul { margin: 0 0 12px; padding-left: 0; list-style: none; }
#panel .body li { margin-bottom: 6px; padding-left: 16px; position: relative; }
#panel .body li::before { content: ""; position: absolute; left: 0; top: .62em; width: 6px; height: 1.5px; background: var(--accent); }
#panel code { font: 12px var(--mono); background: var(--hover); padding: 1px 5px; border-radius: 3px; }
#panel a { color: var(--accent); text-underline-offset: 3px; }
#panel .ask { margin: 8px 0 16px; padding: 14px 16px 15px; background: var(--hl); border-radius: 6px;
  color: var(--text); font: 500 15.5px/1.4 var(--geo); }
#panel .ask b { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font: 300 10px/1 var(--mono);
  text-transform: uppercase; letter-spacing: .12em; color: var(--accent); }
#panel .ask b::before { content: "?"; display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 50%;
  background: var(--accent-grad); color: #FFFFFF; font: 500 10px/1 var(--geo); letter-spacing: 0; }
#panel h3 { font: 300 10px/1 var(--mono); text-transform: uppercase; letter-spacing: .12em; color: var(--muted);
  margin: 18px 0 8px; padding-top: 14px; border-top: 1px solid var(--line); }
#panel .rel { display: block; background: none; border: 0; padding: 4px 0; color: var(--text); font: 400 14px var(--geo); cursor: pointer; text-align: left; text-decoration: none; }
#panel .rel::before { content: "→ "; color: var(--accent); }
#panel .rel:hover { color: var(--accent); }
#panel .close { position: absolute; top: 14px; right: 14px; background: none; border: 0; color: var(--muted); font-size: 20px; cursor: pointer; line-height: 1; padding: 4px; }
#panel .close:hover { color: var(--accent); }
#panel .copy { margin-top: 18px; width: 100%; padding: 11px; border-radius: 4px; border: 0; background: var(--accent-grad);
  color: #FFFFFF; font: 300 11px/1 var(--mono); text-transform: uppercase; letter-spacing: .1em; cursor: pointer; }
#panel .copy:hover { filter: brightness(1.08); }
#tools { position: fixed; left: 24px; bottom: 18px; display: flex; gap: 6px; align-items: center; }
#tools button { width: 30px; height: 30px; border-radius: 4px; border: 1px solid var(--line); background: var(--panel);
  color: var(--muted); font: 300 13px var(--mono); cursor: pointer; }
#tools button:hover { color: var(--accent); border-color: var(--accent); }
#legend { display: flex; gap: 14px; margin-left: 10px; color: var(--muted); font: 300 10px/1 var(--mono); text-transform: uppercase; letter-spacing: .1em; flex-wrap: wrap; }
#legend span { display: inline-flex; gap: 6px; align-items: center; }
#help { position: fixed; left: 24px; bottom: 58px; background: var(--panel); border: 1px solid var(--line); border-radius: 6px;
  padding: 12px 14px; color: var(--soft); font-size: 12.5px; display: none; box-shadow: var(--shadow); }
#help.open { display: block; }
#help kbd { font: 11px var(--mono); border: 1px solid var(--line); border-radius: 3px; padding: 0 4px; color: var(--accent); }
.nochrome #sig { display: none; }
@media (max-width: 640px) {
  #panel { top: auto; left: 12px; right: 12px; width: auto; max-height: 58vh; }
  #legend, #sig { display: none; }
  #hdr { left: 16px; top: 16px; right: 16px; }
  #hdr h1 { font-size: 18px; }
}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Outfit:wght@400;500&family=DM+Mono:wght@300&display=swap">
</head>
<body>
<div id="stage"><svg id="svg"><g id="vp"><g id="xlinks"></g><g id="edges"></g><g id="nodes"></g></g></svg></div>
<div id="hdr"><div class="kicker"></div><h1></h1><div class="lens"></div></div>
<div id="sig"><b>@</b>DANIELNOWORYTA <b>|</b> DANIELNOWORYTA.COM</div>
<aside id="panel" aria-live="polite"></aside>
<div id="help">Click a label to read it. Click a dot to fold its branch.<br>Drag to pan, scroll or pinch to zoom.<br><kbd>F</kbd> fit &nbsp; <kbd>T</kbd> theme &nbsp; <kbd>Esc</kbd> close &nbsp; <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> move</div>
<div id="tools"><button id="fit" title="Fit (F)">⤢</button><button id="zin" title="Zoom in">+</button><button id="zout" title="Zoom out">−</button><button id="theme" title="Light or dark (T)" aria-label="Toggle light or dark mode"></button><button id="hbtn" title="Help">?</button><div id="legend"></div></div>
<script id="data" type="application/json">%%DATA%%</script>
<script>
(() => {
const D = JSON.parse(document.getElementById("data").textContent);
const NS = "http://www.w3.org/2000/svg";
const $ = (s) => document.querySelector(s);
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const KEY = "map:" + D.title;

const byId = new Map(D.nodes.map((n) => [n.id, { ...n, kids: [] }]));
let root;
for (const n of byId.values()) { if (n.parent == null) root = n; else byId.get(n.parent).kids.push(n); }
const back = new Map();
for (const n of byId.values()) for (const l of n.links || []) { if (!back.has(l)) back.set(l, []); back.get(l).push(n.id); }

$("#hdr .kicker").textContent = "// " + (D.kicker || "Map");
$("#hdr h1").textContent = D.title;
$("#hdr .lens").textContent = D.lens || "";
if (D.chrome === false) document.body.classList.add("nochrome");
document.title = D.title;

const folded = new Set(store.get(KEY + ":folded") || []);
let selected = null;

// ---- layout ---------------------------------------------------------------
const ctx = document.createElement("canvas").getContext("2d");
const tw = (s, size, weight) => { ctx.font = (weight || 400) + " " + size + "px Geomanist, Outfit, system-ui, -apple-system, Segoe UI, sans-serif"; return ctx.measureText(s).width; };
const ROW = 28, GROUP = 14, GAP = 36, DOTPAD = 10;

function layout() {
  const visKids = (n) => (folded.has(n.id) ? [] : n.kids);
  const leaves = (n) => { const k = visKids(n); return k.length ? k.reduce((a, c) => a + leaves(c), 0) : 1; };
  const top = root.kids;
  // split top-level branches into right and left, balanced by visible leaf count
  const total = top.reduce((a, c) => a + leaves(c), 0);
  const right = [], left = [];
  let acc = 0;
  for (const c of top) { (acc < total / 2 || !right.length ? right : left).push(c); acc += leaves(c); }
  if (!left.length && right.length > 3) left.push(...right.splice(Math.ceil(right.length / 2)));

  root.x = 0; root.y = 0; root.side = 0; root.depth = 0;
  root.w = tw(root.label, 19, 500);
  root.outR = DOTPAD + root.w; root.outL = 0;

  for (const [side, list] of [[1, right], [-1, left]]) {
    const nodes = [];
    const walk = (n, d) => { n.side = side; n.depth = d; n.w = tw(n.label, 13, 400); nodes.push(n); for (const c of visKids(n)) walk(c, d + 1); };
    list.forEach((c) => walk(c, 1));
    // column positions: each depth starts after the widest label of the previous depth
    const col = [0];
    const maxD = nodes.reduce((a, n) => Math.max(a, n.depth), 0);
    for (let d = 1; d <= maxD; d++) {
      const prevOuter = d === 1 ? (side > 0 ? root.outR : 0) : Math.max(...nodes.filter((n) => n.depth === d - 1).map((n) => DOTPAD + n.w));
      col[d] = (d === 1 ? prevOuter : col[d - 1] + prevOuter) + GAP + (d === 1 && side < 0 ? 0 : 0);
    }
    for (const n of nodes) { n.x = side * col[n.depth]; n.out = n.x + side * (DOTPAD + n.w); }
    // rows
    let y = 0;
    const place = (n) => {
      const k = visKids(n);
      if (!k.length) { n.y = y; y += ROW; return; }
      k.forEach(place);
      n.y = (k[0].y + k[k.length - 1].y) / 2;
    };
    list.forEach((c, i) => { if (i) y += GROUP; place(c); });
    const h = y - ROW;
    for (const n of nodes) n.y -= h / 2;
  }
}

// ---- draw -----------------------------------------------------------------
const gE = $("#edges"), gN = $("#nodes"), gX = $("#xlinks");
const tone = (t) => "var(--" + (t || "text") + ")";
function mark(g, n, r) {
  const st = (n.state && D.states[n.state]) || null;
  const m = st ? st.mark || "hollow" : "hollow";
  if (n === root && !st) { el("circle", { cx: 0, cy: 0, r, fill: "var(--accent)", stroke: "var(--accent)", class: "dot" }, g); return; }
  const c = tone(st ? st.tone : "muted");
  const at = { cx: 0, cy: 0, r, class: "dot" };
  if (m === "filled") el("circle", { ...at, fill: c, stroke: c }, g);
  else if (m === "ring") { el("circle", { ...at, fill: "var(--bg)", stroke: c }, g); el("circle", { cx: 0, cy: 0, r: r - 2.2, fill: c }, g); }
  else if (m === "dashed") el("circle", { ...at, fill: "var(--bg)", stroke: c, "stroke-dasharray": "2 1.6" }, g);
  else if (m === "cross") { el("circle", { ...at, fill: "var(--bg)", stroke: c }, g); el("path", { d: "M-2 -2L2 2M2 -2L-2 2", stroke: c, "stroke-width": 1.3 }, g); }
  else el("circle", { ...at, fill: "var(--bg)", stroke: c }, g);
}

function visible() {
  const out = [];
  const walk = (n) => { out.push(n); if (!folded.has(n.id)) n.kids.forEach(walk); };
  walk(root);
  return out;
}

function draw() {
  layout();
  gE.textContent = ""; gN.textContent = ""; gX.textContent = "";
  const vis = visible();
  const visSet = new Set(vis.map((n) => n.id));
  const onPath = new Set();
  for (let n = selected && byId.get(selected); n; n = n.parent != null ? byId.get(n.parent) : null) onPath.add(n.id);
  const related = new Set();
  if (selected) { const s = byId.get(selected); (s.links || []).forEach((l) => related.add(l)); (back.get(selected) || []).forEach((l) => related.add(l)); }

  for (const n of vis) {
    if (n === root) continue;
    const p = byId.get(n.parent);
    const sx = p === root ? (n.side > 0 ? root.outR + 4 : -DOTPAD + 2) : p.out + p.side * 4;
    const ex = n.x, mx = (sx + ex) / 2;
    el("path", { d: "M" + sx + " " + p.y + "C" + mx + " " + p.y + " " + mx + " " + n.y + " " + ex + " " + n.y, class: "edge" + (onPath.has(n.id) ? " on" : "") }, gE);
  }
  const ys = vis.map((n) => n.y);
  const topY = Math.min(...ys);
  for (const n of vis) for (const l of n.links || []) {
    if (!visSet.has(l)) continue;
    const m = byId.get(l);
    let d;
    if (n.side === m.side && Math.abs(n.x - m.x) < 80) {
      // same column: bow sideways toward the centre so the line clears the dots
      const bx = (n.side >= 0 ? Math.min(n.x, m.x) : Math.max(n.x, m.x)) - (n.side >= 0 ? 1 : -1) * (18 + Math.abs(n.y - m.y) * 0.18);
      d = "M" + n.x + " " + n.y + "C" + bx + " " + n.y + " " + bx + " " + m.y + " " + m.x + " " + m.y;
    } else {
      const lift = Math.max(40, Math.abs(n.x - m.x) * 0.12);
      const cy = Math.min(n.y, m.y, topY + 30) - lift;
      d = "M" + n.x + " " + n.y + "Q" + (n.x + m.x) / 2 + " " + cy + " " + m.x + " " + m.y;
    }
    el("path", { d,
      class: "xlink" + (selected && (selected === n.id || selected === l) ? " on" : "") }, gX);
  }

  for (const n of vis) {
    const g = el("g", { class: "node" + (n === root ? " root" : "") + (onPath.has(n.id) || related.has(n.id) ? " on" : "") + (selected === n.id ? " sel" : ""),
      transform: "translate(" + n.x + " " + n.y + ")", "data-id": n.id, tabindex: 0, role: "button", "aria-label": n.label }, gN);
    const w = n.w + DOTPAD + 14;
    const left = n.side < 0 ? -w + 7 : -7;
    el("rect", { class: "pill", x: left, y: -11, width: w, height: 22, rx: 6 }, g);
    const dot = el("g", { class: "dotg" }, g);
    mark(dot, n, n === root ? 5 : 3.6);
    const t = el("text", { x: n.side < 0 ? -DOTPAD : DOTPAD, y: 4.3, "text-anchor": n.side < 0 ? "end" : "start" }, g);
    t.textContent = n.label;
    if (folded.has(n.id) && n.kids.length) {
      const c = el("text", { class: "more", x: n.side < 0 ? -(DOTPAD + n.w + 6) : DOTPAD + n.w + 6, y: 4, "text-anchor": n.side < 0 ? "end" : "start" }, g);
      c.textContent = "+" + count(n);
    }
  }
}
const count = (n) => n.kids.reduce((a, c) => a + 1 + count(c), 0);

// ---- panel ----------------------------------------------------------------
function md(s) {
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\x60([^\x60]+)\x60/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = []; let list = null, para = [];
  const flush = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };
  for (const line of String(s).split("\n")) {
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (m) { flush(); if (!list) { list = []; } list.push("<li>" + inline(m[1]) + "</li>"); continue; }
    if (list) { out.push("<ul>" + list.join("") + "</ul>"); list = null; }
    if (!line.trim()) flush(); else para.push(line.trim());
  }
  flush(); if (list) out.push("<ul>" + list.join("") + "</ul>");
  return out.join("");
}

function open(id) {
  const n = byId.get(id);
  selected = id;
  const st = n.state && D.states[n.state];
  const rel = [...new Set([...(n.links || []), ...(back.get(id) || [])])].map((r) => byId.get(r));
  const kids = n.kids;
  let h = '<button class="close" aria-label="Close">×</button><h2>' + esc(n.label) + "</h2>";
  h += '<div class="state">' + esc(st ? st.label : n === root ? "Centre" : "Not explored yet") + "</div>";
  if (n.summary) h += '<p class="summary">' + esc(n.summary) + "</p>";
  if (n.body) h += '<div class="body">' + md(n.body) + "</div>";
  if (n.ask) h += '<div class="ask"><b>' + esc(D.askLabel || "Question to ask") + "</b>" + esc(n.ask) + "</div>";
  if (kids.length) h += "<h3>Inside</h3>" + kids.map((k) => '<button class="rel" data-go="' + k.id + '">' + esc(k.label) + "</button>").join("");
  if (rel.length) h += "<h3>Related</h3>" + rel.map((k) => '<button class="rel" data-go="' + k.id + '">' + esc(k.label) + "</button>").join("");
  if (n.sources && n.sources.length) h += "<h3>Sources</h3>" + n.sources.map((s) => '<a class="rel" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || s.url) + "</a>").join("");
  if (D.prompt !== false) h += '<button class="copy">' + esc(D.promptLabel || "Copy “go deeper” prompt") + "</button>";
  const p = $("#panel");
  p.innerHTML = h; p.classList.add("open"); p.scrollTop = 0;
  p.querySelector(".close").onclick = close;
  p.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { reveal(b.dataset.go); open(b.dataset.go); focusOn(b.dataset.go); }));
  const cp = p.querySelector(".copy");
  if (cp) cp.onclick = () => {
    const text = (D.promptTemplate || 'Go deeper on "{label}" ({id}) in the {title} map.').replace(/\{label\}/g, n.label).replace(/\{id\}/g, n.id).replace(/\{title\}/g, D.title);
    copy(text).then(() => { cp.textContent = "Copied. Paste it to your agent."; setTimeout(() => (cp.textContent = D.promptLabel || "Copy “go deeper” prompt"), 1800); });
  };
  draw();
}
function close() { selected = null; $("#panel").classList.remove("open"); draw(); }
function copy(t) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).catch(() => fallback(t));
  return Promise.resolve(fallback(t));
}
function fallback(t) { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); } catch {} a.remove(); }
function reveal(id) { let changed = false; for (let n = byId.get(id); n && n.parent != null; n = byId.get(n.parent)) if (folded.delete(n.parent)) changed = true; if (changed) { store.set(KEY + ":folded", [...folded]); draw(); } }

// ---- view -----------------------------------------------------------------
const svg = $("#svg"), vp = $("#vp");
let view = { x: 0, y: 0, k: 1 };
const apply = () => vp.setAttribute("transform", "translate(" + view.x + " " + view.y + ") scale(" + view.k + ")");
function fit() {
  const b = vp.getBBox(), W = svg.clientWidth, H = svg.clientHeight;
  const panelW = $("#panel").classList.contains("open") && W > 640 ? 384 : 0;
  const k = Math.min(1.5, (W - panelW - 60) / (b.width || 1), (H - 110) / (b.height || 1));
  view = { k, x: (W - panelW) / 2 - (b.x + b.width / 2) * k, y: H / 2 + 6 - (b.y + b.height / 2) * k };
  apply();
}
function zoom(f, cx, cy) {
  const k = Math.min(4, Math.max(0.2, view.k * f));
  cx = cx ?? svg.clientWidth / 2; cy = cy ?? svg.clientHeight / 2;
  view.x = cx - (cx - view.x) * (k / view.k); view.y = cy - (cy - view.y) * (k / view.k); view.k = k; apply();
}
function focusOn(id) {
  const n = byId.get(id); if (!n) return;
  const W = svg.clientWidth, H = svg.clientHeight, panelW = W > 640 ? 384 : 0;
  const a = Math.min(n.x, n.out ?? n.x) * view.k + view.x, b = Math.max(n.x, n.out ?? n.x) * view.k + view.x;
  const sy = n.y * view.k + view.y;
  // nudge just enough to bring the node clear of the panel and the edges, never re-centre
  const R = W - panelW - 48, L = 48, T = 110, B = H - 70;
  let dx = 0, dy = 0;
  if (b > R) dx = R - b; else if (a < L) dx = L - a;
  if (sy < T) dy = T - sy; else if (sy > B) dy = B - sy;
  if (dx || dy) { view.x += dx; view.y += dy; apply(); }
}

const stage = $("#stage");
let drag = null, moved = false;
const pts = new Map();
stage.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, e); drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = false; stage.setPointerCapture(e.pointerId); });
stage.addEventListener("pointermove", (e) => {
  if (!pts.has(e.pointerId)) return;
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    const d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    pts.set(e.pointerId, e);
    const [c, d] = [...pts.values()];
    const d1 = Math.hypot(c.clientX - d.clientX, c.clientY - d.clientY);
    if (d0) zoom(d1 / d0, (c.clientX + d.clientX) / 2, (c.clientY + d.clientY) / 2);
    moved = true; return;
  }
  pts.set(e.pointerId, e);
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) { moved = true; stage.classList.add("dragging"); }
  view.x = drag.vx + dx; view.y = drag.vy + dy; apply();
});
const up = (e) => {
  pts.delete(e.pointerId); stage.classList.remove("dragging");
  if (drag && !moved) {
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const g = t && t.closest(".node");
    if (g) {
      const n = byId.get(g.dataset.id);
      if (t.closest(".dotg") && n.kids.length && n !== root) { folded.has(n.id) ? folded.delete(n.id) : folded.add(n.id); store.set(KEY + ":folded", [...folded]); draw(); }
      else { open(n.id); focusOn(n.id); }
    }
  }
  drag = null;
};
stage.addEventListener("pointerup", up);
stage.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); drag = null; });
stage.addEventListener("wheel", (e) => { e.preventDefault(); if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY); else { view.x -= e.deltaX; apply(); } }, { passive: false });

$("#fit").onclick = fit; $("#zin").onclick = () => zoom(1.25); $("#zout").onclick = () => zoom(0.8);
$("#hbtn").onclick = () => $("#help").classList.toggle("open");

// theme: follows the system until the viewer picks one, then remembers it
const sysDark = () => !window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches;
const isDark = () => (document.documentElement.dataset.theme || (sysDark() ? "dark" : "light")) === "dark";
const paintThemeBtn = () => { $("#theme").textContent = isDark() ? "☀" : "☾"; };
const saved = store.get("map:theme");
if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
function toggleTheme() { const next = isDark() ? "light" : "dark"; document.documentElement.dataset.theme = next; store.set("map:theme", next); paintThemeBtn(); }
$("#theme").onclick = toggleTheme;
if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintThemeBtn);
paintThemeBtn();

function nav(dir) {
  if (!selected) return open(root.id);
  const n = byId.get(selected);
  let t;
  const outward = (dir === "right" && n.side >= 0) || (dir === "left" && n.side <= 0);
  if (dir === "up" || dir === "down") {
    const sib = visible().filter((m) => m.depth === n.depth && m.side === n.side).sort((a, b) => a.y - b.y);
    t = sib[sib.indexOf(n) + (dir === "up" ? -1 : 1)];
  } else if (n === root) {
    t = visible().filter((m) => m.depth === 1 && m.side === (dir === "right" ? 1 : -1))[0];
  } else if (outward) { if (folded.has(n.id)) { folded.delete(n.id); draw(); } t = n.kids[Math.floor((n.kids.length - 1) / 2)]; }
  else t = byId.get(n.parent);
  if (t) { open(t.id); focusOn(t.id); }
}
document.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, textarea")) return;
  if (e.key === "Escape") close();
  else if (e.key === "f" || e.key === "F") fit();
  else if (e.key === "t" || e.key === "T") toggleTheme();
  else if (e.key === "Enter" && e.target.closest && e.target.closest(".node")) open(e.target.closest(".node").dataset.id);
  else if (e.key.startsWith("Arrow")) { e.preventDefault(); nav(e.key.slice(5).toLowerCase()); }
});

// legend: only states that are used
const used = new Set(D.nodes.map((n) => n.state || (n.parent == null ? null : "open")).filter(Boolean));
const lg = $("#legend");
for (const [name, st] of Object.entries(D.states)) {
  if (!used.has(name)) continue;
  const s = document.createElement("span");
  const sv = el("svg", { width: 12, height: 12, viewBox: "-6 -6 12 12" });
  sv.style.width = "12px"; sv.style.height = "12px";
  mark(sv, { state: name }, 3.6);
  s.appendChild(sv); s.appendChild(document.createTextNode(st.label)); lg.appendChild(s);
}

draw(); fit();
addEventListener("resize", fit);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { draw(); fit(); });
})();
</script>
</body>
</html>
`;

// ---------------------------------------------------------------------------

function main() {
  const [cmd, file, ...rest] = process.argv.slice(2);
  const usage = "usage: node map.mjs <check|outline|render> <map.json> [--out <file.html>]";
  if (!cmd || !file || !["check", "outline", "render"].includes(cmd)) fail(usage);
  const map = load(file);
  const result = check(map);
  report(result, file);
  if (cmd === "check") {
    const s = result.stats;
    console.log(`ok: ${s.nodes} nodes, ${s.branches} branches, ${s.depth} levels deep, ${s.links} cross-links`);
  } else if (cmd === "outline") {
    console.log(outline(map, result));
  } else {
    const i = rest.indexOf("--out");
    const out = i >= 0 && rest[i + 1] ? rest[i + 1] : join(dirname(file), basename(file, extname(file)) + ".html");
    writeFileSync(out, render(map, result));
    console.log(`rendered ${resolve(out)}`);
  }
}

main();
