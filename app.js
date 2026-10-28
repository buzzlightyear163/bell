const C = window.BELL;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SOL_MINT = "So11111111111111111111111111111111111111112";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pad = (n) => String(n).padStart(2, "0");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const fmtPrice = (p) => (p == null || !isFinite(p) ? "–" : usd.format(p));
function fmtChange(c) {
  if (c == null || !isFinite(c)) return "–";
  const sign = c > 0 ? "+" : c < 0 ? "−" : "";
  return sign + Math.abs(c).toFixed(2) + "%";
}
const dirClass = (c) => (c == null || !isFinite(c) || c === 0 ? "flat" : c > 0 ? "up" : "down");
function fmtUnits(u) {
  if (!isFinite(u) || u <= 0) return "0";
  if (u >= 100) return u.toFixed(1);
  if (u >= 1) return u.toFixed(3);
  if (u >= 0.01) return u.toFixed(4);
  return u.toPrecision(3);
}

/* ================================================================== */
/* Market clock (New York)                                             */
/* ================================================================== */

const NY = "America/New_York";
const BELL_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
const etFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: NY, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit"
});
function etParts(ts) {
  const o = {};
  for (const p of etFmt.formatToParts(new Date(ts))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second };
}
function etToUtc(y, m, d, h, mi) {
  const target = Date.UTC(y, m - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = etParts(guess);
    guess = target - (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - guess);
  }
  return guess;
}
function addDays(day, n) {
  const t = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
const dayKey = (day) => `${day.y}-${pad(day.m)}-${pad(day.d)}`;
const weekday = (day) => new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
const holidayName = (day) => (C.holidays || {})[dayKey(day)] || null;
const isTradingDay = (day) => { const w = weekday(day); return w >= 1 && w <= 5 && !holidayName(day); };
const bellAt = (day) => etToUtc(day.y, day.m, day.d, 9, 30);
const todayNY = (now) => { const p = etParts(now); return { y: p.y, m: p.m, d: p.d }; };

function nextBell(now) {
  let day = todayNY(now);
  for (let i = 0; i < 20; i++) {
    if (isTradingDay(day) && bellAt(day) > now) return { ts: bellAt(day), day };
    day = addDays(day, 1);
  }
  return null;
}
function lastBell(now) {
  let day = todayNY(now);
  for (let i = 0; i < 20; i++) {
    if (isTradingDay(day) && bellAt(day) <= now) return { ts: bellAt(day), day };
    day = addDays(day, -1);
  }
  return { ts: now - 864e5, day };
}
function fmtCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600) + d * 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
const localTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const sameLocalDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
function localWhen(ts, now) {
  if (sameLocalDay(ts, now)) return `Today ${localTime(ts)}`;
  if (sameLocalDay(ts, now + 864e5)) return `Tomorrow ${localTime(ts)}`;
  return `${new Date(ts).toLocaleDateString("en-US", { weekday: "short" })} ${localTime(ts)}`;
}

/* ================================================================== */
/* State                                                               */
/* ================================================================== */

const state = {
  rows: [], leader: null, source: null, updatedAt: 0,
  last: null, next: null,
  pot: 0, potLive: false, potDrained: 0,
  bell: null, rig: 720,
  labelUntil: 0,
  audio: null, soundArmed: false
};

/* ================================================================== */
/* Static wiring                                                       */
/* ================================================================== */

function wireConfig() {
  $$(".js-buy").forEach((a) => { a.href = C.buyUrl || "#"; });
  $$(".js-pot-share").forEach((el) => { el.textContent = C.potShare; });
  $$(".js-burn-share").forEach((el) => { el.textContent = C.burnShare; });
  $("#f-pair").textContent = C.pairedWith;
  const x = $("#x-link");
  if (C.xUrl) { x.href = C.xUrl; x.hidden = false; }
  const ca = $("#ca");
  if (C.ca) {
    $("#ca-addr").textContent = C.ca.slice(0, 4) + "…" + C.ca.slice(-4);
    ca.hidden = false;
    ca.setAttribute("aria-label", "Copy the $BELL contract address");
    ca.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(C.ca); }
      catch {
        const t = document.createElement("textarea");
        t.value = C.ca; document.body.appendChild(t); t.select();
        try { document.execCommand("copy"); } catch {}
        t.remove();
      }
      toast("Contract address copied");
    });
  }
}

let toastTimer = 0;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ================================================================== */
/* Sound: a synthesized bell, only after someone presses Ring          */
/* ================================================================== */

function armSound() {
  try {
    if (!state.audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      const master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(comp); comp.connect(ctx.destination);
      state.audio = { ctx, master };
    }
    if (state.audio.ctx.state === "suspended") state.audio.ctx.resume();
    state.soundArmed = true;
  } catch {}
}
function ding(intensity) {
  if (!state.soundArmed || !state.audio) return;
  const { ctx, master } = state.audio;
  const t = ctx.currentTime + 0.005;
  const k = clamp(intensity / 1.3, 0.25, 1);
  const base = 415;
  const partials = [[0.5, 0.32, 5.5], [1, 0.55, 4.2], [1.19, 0.3, 3.0], [1.5, 0.2, 2.4], [2.0, 0.34, 1.9], [2.52, 0.13, 1.3], [3.01, 0.1, 1.0], [4.07, 0.07, 0.7], [5.43, 0.04, 0.45]];
  for (const [r, a, d] of partials) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = base * r * (1 + (Math.random() - 0.5) * 0.002);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(a * k, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d * (0.6 + 0.4 * k));
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + d + 0.1);
  }
}

/* ================================================================== */
/* The live bell                                                       */
/* ================================================================== */

const rig = $("#bell-rig");
const anchorHero = $("#anchor-hero");
const anchorDial = $("#anchor-dial");
const daySec = $("#day");
const hero = $("#hero");

function rigSize() {
  const w = anchorHero.getBoundingClientRect().width;
  return Math.round(clamp(w, 360, 900));
}

async function initBell() {
  if (reduceMotion) return;
  try {
    const mod = await import("./assets/bell-scene.js");
    state.rig = rigSize();
    rig.style.setProperty("--rig", state.rig + "px");
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 1700 / state.rig);
    const bell = mod.createBell($("#bell-canvas"), { size: state.rig, dpr });
    if (!bell) return;
    state.bell = bell;
    bell.onStrike(onStrike);
    placeBell();
    requestAnimationFrame(() => document.body.classList.add("webgl-on"));
    window.addEventListener("pointermove", (e) => {
      bell.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    }, { passive: true });
    let rT = 0;
    window.addEventListener("resize", () => {
      clearTimeout(rT);
      rT = setTimeout(() => {
        const s = rigSize();
        if (Math.abs(s - state.rig) > 40) { state.rig = s; rig.style.setProperty("--rig", s + "px"); bell.setSize(s); }
      }, 200);
    });
    document.addEventListener("visibilitychange", placeBell);
  } catch (e) {
    // Keep the still image.
  }
}

function placeBell() {
  if (!state.bell) return;
  const vh = innerHeight;
  const h = anchorHero.getBoundingClientRect();
  const d = anchorDial.getBoundingClientRect();
  const day = daySec.getBoundingClientRect();
  const t = easeInOut(clamp((vh - day.top) / (vh * 0.92), 0, 1));
  const cx = lerp(h.left + h.width / 2, d.left + d.width / 2, t);
  const cy = lerp(h.top + h.height / 2, d.top + d.height / 2, t);
  const size = lerp(h.width, d.width, t);
  const s = size / state.rig;
  rig.style.transform = `translate3d(${(cx - size / 2).toFixed(1)}px, ${(cy - size / 2).toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
  const visible = cy + size / 2 > -40 && cy - size / 2 < vh + 40 && !document.hidden;
  state.bell.setActive(visible);
}

function spawnRipple(kind, x, y, to) {
  if (reduceMotion) return;
  const r = document.createElement("span");
  r.className = "ripple " + kind;
  r.style.left = x * 100 + "%";
  r.style.top = y * 100 + "%";
  r.style.setProperty("--to", to);
  $("#ripples").appendChild(r);
  r.addEventListener("animationend", () => r.remove());
}

function onStrike(intensity) {
  ding(intensity);
  const m = state.bell ? state.bell.mouth() : { x: 0.5, y: 0.75 };
  spawnRipple("mouth", m.x, m.y, (2.2 + intensity * 1.6).toFixed(2));
  if (intensity > 0.8) spawnRipple("ring", 0.5, 0.52, (2.6 + intensity).toFixed(2));
  const dg = $("#hc-digits");
  dg.classList.remove("flash"); void dg.offsetWidth; dg.classList.add("flash");
}

function ring(kind) {
  if (state.bell) {
    state.bell.ring(kind === "live" ? 1.15 : 1);
  } else {
    // Still image: three dings so it still feels like a bell.
    [0, 520, 1350].forEach((ms, i) => setTimeout(() => onStrike(1.3 - i * 0.3), ms));
  }
  const l = state.leader;
  const lab = $("#hc-label");
  if (kind === "demo") {
    lab.textContent = l ? `Demo ring. Right now the pot would buy ${l.sym}.` : "Demo ring.";
  } else {
    lab.textContent = "The bell rang. The pot is filling again.";
  }
  lab.classList.add("is-bell");
  state.labelUntil = Date.now() + 5200;
  if (kind === "demo" && !state.potLive) {
    state.potDrained += currentPot();
  }
}

/* ================================================================== */
/* Pot                                                                 */
/* ================================================================== */

function currentPot() {
  if (state.potLive) return state.pot;
  if (!C.simulate || !state.last) return 0;
  const hrs = Math.max(0, (Date.now() - state.last.ts) / 36e5);
  return Math.max(0, C.sim.potPerHour * hrs - state.potDrained);
}
async function pollPot() {
  if (!C.potEndpoint) return;
  try {
    const r = await fetch(C.potEndpoint, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error();
    const d = await r.json();
    const v = typeof d.pot === "string" ? parseFloat(d.pot) : d.pot;
    if (isFinite(v)) { state.pot = v; state.potLive = true; }
  } catch {}
}

/* ================================================================== */
/* Hero clock, facts                                                   */
/* ================================================================== */

function heroLabel(now) {
  const today = todayNY(now);
  if (state.next && dayKey(state.next.day) === dayKey(today)) return "until the next opening bell";
  const hol = holidayName(today);
  if (hol) return `${hol}, no bell today. Until the next one`;
  const w = weekday(today);
  if (w === 0 || w === 6) return "Weekend, no bell today. Until Monday's";
  return "until the next opening bell";
}

let lastSecond = -1;
function tick() {
  const now = Date.now();
  if (state.next && now >= state.next.ts) {
    ring("live");
    refreshBells(now);
  }
  const sec = Math.floor(now / 1000);
  if (sec !== lastSecond) {
    lastSecond = sec;
    const cd = fmtCountdown(state.next.ts - now);
    $("#hc-digits").textContent = cd;
    $("#end-countdown").textContent = cd;
    if (now > state.labelUntil) {
      const lab = $("#hc-label");
      lab.textContent = heroLabel(now);
      lab.classList.remove("is-bell");
    }
    $("#f-local").textContent = localWhen(state.next.ts, now);
    const pot = currentPot();
    $("#f-pot").textContent = C.simulate || state.potLive ? usd.format(pot) : "–";
    renderCut();
    renderBoardStatus();
  }
  requestAnimationFrame(tick);
}

function refreshBells(now) {
  state.last = lastBell(now);
  state.next = nextBell(now);
  state.potDrained = 0;
  renderCalendar(now);
}

/* ================================================================== */
/* A day on the dial                                                   */
/* ================================================================== */

const SVGNS = "http://www.w3.org/2000/svg";
const DC = 300;
const angleOf = (min) => (-90 + ((min - BELL_MIN) / 1440) * 360) * Math.PI / 180;
const ptAt = (min, r) => [DC + r * Math.cos(angleOf(min)), DC + r * Math.sin(angleOf(min))];
function arcPath(m0, span, r) {
  if (span <= 0.01) return "";
  const s = Math.min(span, 1439.9);
  const [x0, y0] = ptAt(m0, r), [x1, y1] = ptAt(m0 + s, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${s > 720 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function el(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

const R_PROG = 252;
let progEl, tipEl, haloEl;
function buildDial() {
  const svg = $("#dial-svg");
  const defs = el("defs", {}, svg);
  const bz = el("linearGradient", { id: "bezel", x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
  el("stop", { offset: "0", "stop-color": "#d6eef7", "stop-opacity": ".85" }, bz);
  el("stop", { offset: ".45", "stop-color": "#4f7482", "stop-opacity": ".55" }, bz);
  el("stop", { offset: "1", "stop-color": "#52e0a6", "stop-opacity": ".45" }, bz);
  const pg = el("linearGradient", { id: "prog", x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
  el("stop", { offset: "0", "stop-color": "#8fc6dc" }, pg);
  el("stop", { offset: "1", "stop-color": "#52e0a6" }, pg);
  const f = el("filter", { id: "glow", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
  el("feGaussianBlur", { stdDeviation: "2.4", result: "b" }, f);
  const m = el("feMerge", {}, f);
  el("feMergeNode", { in: "b" }, m); el("feMergeNode", { in: "SourceGraphic" }, m);
  const face = el("radialGradient", { id: "face", cx: "50%", cy: "42%", r: "60%" }, defs);
  el("stop", { offset: "0", "stop-color": "#123039", "stop-opacity": ".9" }, face);
  el("stop", { offset: ".7", "stop-color": "#0a1a20", "stop-opacity": ".75" }, face);
  el("stop", { offset: "1", "stop-color": "#081419", "stop-opacity": "0" }, face);

  el("circle", { cx: DC, cy: DC, r: 288, fill: "url(#face)" }, svg);
  el("circle", { cx: DC, cy: DC, r: 290, class: "d-bezel" }, svg);
  el("circle", { cx: DC, cy: DC, r: 279, class: "d-faint" }, svg);
  el("circle", { cx: DC, cy: DC, r: 186, class: "d-faint" }, svg);

  el("path", { d: arcPath(BELL_MIN, CLOSE_MIN - BELL_MIN, 268), class: "d-open" }, svg);
  el("path", { d: arcPath(CLOSE_MIN, 1440 - (CLOSE_MIN - BELL_MIN), 268), class: "d-chain" }, svg);
  const [a0x, a0y] = ptAt(CLOSE_MIN, 260), [a1x, a1y] = ptAt(CLOSE_MIN, 276);
  el("line", { x1: a0x, y1: a0y, x2: a1x, y2: a1y, stroke: "#b9e1f0", "stroke-width": 1.6, "stroke-linecap": "round" }, svg);
  const [lx, ly] = ptAt(CLOSE_MIN, 208);
  el("text", { x: lx, y: ly, class: "d-label" }, svg).textContent = "16:00";

  el("circle", { cx: DC, cy: DC, r: R_PROG, class: "d-track" }, svg);
  for (let q = 0; q < 96; q++) {
    const min = q * 15;
    const hourMark = min % 60 === 0;
    const six = min % 360 === 0;
    const r0 = six ? 220 : hourMark ? 230 : 238;
    const [x0, y0] = ptAt(min, r0), [x1, y1] = ptAt(min, 244);
    el("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: six ? "d-idx" : hourMark ? "d-hr" : "d-min" }, svg);
    if (six) {
      const [tx, ty] = ptAt(min, 200);
      el("text", { x: tx, y: ty, class: "d-num" }, svg).textContent = pad(min / 60);
    }
  }
  progEl = el("path", { d: "", class: "d-prog" }, svg);
  haloEl = el("circle", { cx: DC, cy: DC - R_PROG, r: 10, class: "d-tip-halo" }, svg);
  tipEl = el("circle", { cx: DC, cy: DC - R_PROG, r: 5, class: "d-tip" }, svg);
}

let dayRung = false, lastStep = -1;
function updateDay() {
  const vh = innerHeight;
  const r = daySec.getBoundingClientRect();
  const p = clamp(-r.top / (r.height - vh), 0, 1);
  const span = p * 1440;
  progEl.setAttribute("d", arcPath(BELL_MIN, span, R_PROG));
  const [x, y] = ptAt(BELL_MIN + span, R_PROG);
  tipEl.setAttribute("cx", x.toFixed(2)); tipEl.setAttribute("cy", y.toFixed(2));
  haloEl.setAttribute("cx", x.toFixed(2)); haloEl.setAttribute("cy", y.toFixed(2));

  const rung = p >= 0.985;
  const mins = rung ? BELL_MIN : Math.round(BELL_MIN + span) % 1440;
  $("#dc-time").textContent = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  $("#dc-pot").textContent = rung ? "Paid out" : usd0.format(p * C.sim.potPerHour * 24);

  const step = p < 0.271 ? 0 : p < 0.93 ? 1 : 2;
  if (step !== lastStep) {
    lastStep = step;
    $$(".step").forEach((s) => s.classList.toggle("is-on", +s.dataset.step === step));
  }
  $("#rail-fill").style.width = (p * 100).toFixed(1) + "%";

  const lead = $("#dc-lead");
  const priced = state.rows.filter((r) => r.price != null);
  if (step === 0) lead.textContent = "Wall Street open";
  else if (step === 1 && priced.length) {
    const cand = priced[Math.floor(p * 26) % priced.length];
    lead.innerHTML = "";
    lead.append("Overnight leader ");
    const b = document.createElement("b"); b.textContent = cand.sym; lead.appendChild(b);
  } else if (state.leader) {
    lead.innerHTML = "";
    const b = document.createElement("b");
    if (rung) {
      b.textContent = state.leader.sym;
      lead.append(b, " sent to holders");
    } else {
      b.textContent = `${state.leader.sym} ${fmtChange(state.leader.change)}`;
      lead.append("Next in line ", b);
    }
  } else lead.textContent = rung ? "Sent to holders" : "Overnight";

  if (p >= 0.985 && !dayRung) {
    dayRung = true;
    if (state.bell) state.bell.ring(0.9);
  }
  if (p < 0.9) dayRung = false;
}

/* ================================================================== */
/* Prices                                                              */
/* ================================================================== */

const JUP = ["https://api.jup.ag", "https://lite-api.jup.ag"];
const CACHE_KEY = "bell.tokens.v1";
async function getJSON(url, ms = 9000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}
async function jup(path) {
  let err;
  for (const host of JUP) { try { return await getJSON(host + path); } catch (e) { err = e; } }
  throw err;
}
const safeIcon = (u) => (typeof u === "string" && /^https:\/\//.test(u) ? u : null);
const num = (v) => { const n = typeof v === "string" ? parseFloat(v) : v; return typeof n === "number" && isFinite(n) ? n : null; };

async function resolveViaJupiter(sym) {
  const arr = await jup(`/tokens/v2/search?query=${encodeURIComponent(sym)}`);
  const list = (Array.isArray(arr) ? arr : []).filter((t) => (t.symbol || "").toLowerCase() === sym.toLowerCase() && num(t.usdPrice) > 1);
  if (!list.length) return null;
  list.sort((a, b) => (b.isVerified === true) - (a.isVerified === true) || (num(b.liquidity) || num(b.mcap) || 0) - (num(a.liquidity) || num(a.mcap) || 0));
  const t = list[0];
  return { mint: t.id, price: num(t.usdPrice), change: num(t.stats24h && t.stats24h.priceChange), icon: safeIcon(t.icon), src: "jupiter" };
}
async function resolveViaDex(sym) {
  const d = await getJSON(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(sym)}`);
  const pairs = (d && d.pairs ? d.pairs : []).filter((p) => p.chainId === "solana" && p.baseToken && (p.baseToken.symbol || "").toLowerCase() === sym.toLowerCase() && num(p.priceUsd) > 1);
  if (!pairs.length) return null;
  pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
  const p = pairs[0];
  return { mint: p.baseToken.address, price: num(p.priceUsd), change: num(p.priceChange && p.priceChange.h24), icon: safeIcon(p.info && p.info.imageUrl), src: "dexscreener" };
}
async function resolveSymbol(sym) {
  try { const r = await resolveViaJupiter(sym); if (r) return r; } catch {}
  try { const r = await resolveViaDex(sym); if (r) return r; } catch {}
  return null;
}
function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!c || Date.now() - c.ts > 24 * 36e5) return null;
    return c.map;
  } catch { return null; }
}
function writeCache(map) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), map })); } catch {} }
const baseRows = () => C.board.map(([sym, name]) => ({ sym, name, price: null, change: null, icon: null, mint: null }));

async function loadBoard() {
  const liveRows = baseRows();
  state.rows = liveRows;
  applyRows();
  const guard = setTimeout(() => { if (!state.source) useReference(); }, 7000);
  const cached = readCache();
  if (cached) {
    liveRows.forEach((r) => { const c = cached[r.sym]; if (c) { r.mint = c.mint; r.icon = c.icon; } });
    if (await refreshPrices()) { clearTimeout(guard); return; }
  }
  const queue = liveRows.slice();
  const worker = async () => {
    while (queue.length) {
      const row = queue.shift();
      const r = await resolveSymbol(row.sym);
      if (r) {
        Object.assign(row, { mint: r.mint, price: r.price, change: r.change, icon: r.icon || row.icon });
        state.rows = liveRows;
        state.source = state.source && state.source !== "reference" ? state.source : r.src;
        state.updatedAt = Date.now();
        applyRows();
      }
    }
  };
  await Promise.all([worker(), worker()]);
  clearTimeout(guard);
  const resolved = liveRows.filter((r) => r.mint && r.price);
  if (resolved.length >= 3) {
    const map = {};
    resolved.forEach((r) => { map[r.sym] = { mint: r.mint, icon: r.icon }; });
    writeCache(map);
  } else useReference();
}
async function refreshPrices() {
  const rows = state.rows.filter((r) => r.mint);
  if (!rows.length) return false;
  try {
    const d = await jup(`/price/v3?ids=${rows.map((r) => r.mint).concat(SOL_MINT).join(",")}`);
    let hits = 0;
    rows.forEach((r) => {
      const q = d && d[r.mint];
      if (q && num(q.usdPrice)) {
        r.price = num(q.usdPrice);
        if (num(q.priceChange24h) != null) r.change = num(q.priceChange24h);
        hits++;
      }
    });
    if (hits >= 3) { state.source = "jupiter"; state.updatedAt = Date.now(); applyRows(); return true; }
  } catch {}
  try {
    const pairs = await getJSON(`https://api.dexscreener.com/tokens/v1/solana/${rows.map((r) => r.mint).join(",")}`);
    const best = {};
    (Array.isArray(pairs) ? pairs : []).forEach((p) => {
      const a = p.baseToken && p.baseToken.address;
      if (!a) return;
      const liq = (p.liquidity && p.liquidity.usd) || 0;
      if (!best[a] || liq > best[a].liq) best[a] = { liq, price: num(p.priceUsd), change: num(p.priceChange && p.priceChange.h24) };
    });
    let hits = 0;
    rows.forEach((r) => { const b = best[r.mint]; if (b && b.price) { r.price = b.price; r.change = b.change; hits++; } });
    if (hits >= 3) { state.source = "dexscreener"; state.updatedAt = Date.now(); applyRows(); return true; }
  } catch {}
  return false;
}
function useReference() {
  const ref = C.reference.prices;
  state.rows = baseRows().filter((r) => ref[r.sym]).map((r) => Object.assign(r, { price: ref[r.sym][0], change: ref[r.sym][1] }));
  state.source = "reference";
  state.updatedAt = Date.now();
  applyRows();
}

function applyRows() {
  const priced = state.rows.filter((r) => r.price != null);
  const sorted = priced.slice().sort((a, b) => (b.change ?? -1e9) - (a.change ?? -1e9));
  state.leader = sorted.find((r) => r.change != null) || sorted[0] || null;
  renderLeader();
  renderRows(sorted.filter((r) => r !== state.leader).concat(state.rows.filter((r) => r.price == null)));
  renderTape(sorted);
  renderFacts();
  renderCut();
  renderBoardStatus();
}

function icon(r, cls) {
  const box = document.createElement("span");
  box.className = cls;
  if (r && r.icon) {
    const img = document.createElement("img");
    img.src = r.icon; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
    img.addEventListener("error", () => { img.remove(); box.textContent = r.sym[0]; });
    box.appendChild(img);
  } else box.textContent = r ? r.sym[0] : "";
  return box;
}

function renderLeader() {
  const l = state.leader;
  const ico = $("#leader-ico");
  ico.replaceWith(Object.assign(icon(l, "leader-ico"), { id: "leader-ico" }));
  $("#leader-sym").textContent = l ? l.sym : "–";
  $("#leader-name").textContent = l ? l.name : "Reading the board";
  const ch = $("#leader-ch");
  ch.textContent = l ? fmtChange(l.change) : "–";
  ch.className = "leader-ch num " + (l ? dirClass(l.change) : "");
  $("#leader-px").textContent = l ? fmtPrice(l.price) : "";
  const note = $("#leader-note");
  if (l && l.price) {
    const units = currentPot() / l.price;
    note.textContent = units > 0 ? `The pot right now would buy ${fmtUnits(units)} ${l.sym}.` : "The pot starts filling after each bell.";
  } else note.textContent = "";
}

function renderRows(rows) {
  const host = $("#rows");
  host.textContent = "";
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.change || 0)), Math.abs((state.leader && state.leader.change) || 0));
  rows.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "row"; row.setAttribute("role", "listitem");
    const rank = document.createElement("span"); rank.className = "r-rank"; rank.textContent = r.price != null ? i + 2 : "";
    const stock = document.createElement("span"); stock.className = "r-stock";
    const txt = document.createElement("span"); txt.style.minWidth = "0";
    const sym = document.createElement("span"); sym.className = "r-sym"; sym.textContent = r.sym;
    const nm = document.createElement("span"); nm.className = "r-name"; nm.textContent = " " + r.name;
    txt.append(sym, nm);
    stock.append(icon(r, "r-ico"), txt);
    const px = document.createElement("span"); px.className = "r-px"; px.textContent = fmtPrice(r.price);
    const ch = document.createElement("span"); ch.className = "r-ch " + dirClass(r.change); ch.textContent = fmtChange(r.change);
    const barCell = document.createElement("span"); barCell.className = "bar-cell";
    const bar = document.createElement("span"); bar.className = "bar"; bar.style.display = "block";
    if (r.change) {
      const fill = document.createElement("span");
      const w = (Math.abs(r.change) / maxAbs) * 50;
      fill.className = "bar-fill " + (r.change > 0 ? "up" : "down");
      fill.style.width = w + "%";
      fill.style.left = r.change > 0 ? "50%" : (50 - w) + "%";
      bar.appendChild(fill);
    }
    barCell.appendChild(bar);
    row.append(rank, stock, px, ch, barCell);
    host.appendChild(row);
  });
}

let tapeBuilt = false;
function renderTape(rows) {
  const track = $("#tape");
  if (!rows.length) return;
  const list = rows.slice().sort((a, b) => a.sym.localeCompare(b.sym));
  if (!tapeBuilt || track.children.length !== list.length * 2) {
    track.textContent = "";
    track.classList.remove("run");
    list.concat(list).forEach((r) => {
      const item = document.createElement("span");
      item.className = "tape-item"; item.dataset.sym = r.sym;
      item.innerHTML = `<span class="t-sym"></span><span class="t-px"></span><span class="t-ch"></span>`;
      item.querySelector(".t-sym").textContent = r.sym.replace(/x$/, "");
      track.appendChild(item);
    });
    track.style.setProperty("--tape-dur", Math.max(30, list.length * 6) + "s");
    if (!reduceMotion) track.classList.add("run");
    tapeBuilt = true;
  }
  list.forEach((r) => {
    $$(`.tape-item[data-sym="${r.sym}"]`, track).forEach((item) => {
      item.querySelector(".t-px").textContent = fmtPrice(r.price);
      const c = item.querySelector(".t-ch");
      c.className = "t-ch " + dirClass(r.change);
      c.textContent = fmtChange(r.change);
      const isLead = state.leader && state.leader.sym === r.sym;
      let tag = item.querySelector(".t-lead");
      if (isLead && !tag) { tag = document.createElement("span"); tag.className = "t-lead"; tag.textContent = "Next in line"; item.appendChild(tag); }
      else if (!isLead && tag) tag.remove();
    });
  });
}

function renderFacts() {
  const f = $("#f-lead");
  const l = state.leader;
  if (!l) { f.textContent = "Reading the board"; return; }
  f.innerHTML = "";
  f.append(l.sym + " ");
  const b = document.createElement("b"); b.className = dirClass(l.change); b.textContent = fmtChange(l.change);
  f.appendChild(b);
}

function renderBoardStatus() {
  const s = $("#board-status");
  if (!state.source) return;
  let text, live = true;
  if (state.source === "reference") {
    live = false;
    text = `Live prices are unavailable right now. Showing reference prices from ${C.reference.label}.`;
  } else {
    const ago = Math.max(0, Math.round((Date.now() - state.updatedAt) / 1000));
    const src = state.source === "jupiter" ? "Jupiter" : "DexScreener";
    text = `Live from ${src}. Updated ${ago < 2 ? "just now" : ago + " seconds ago"}.`;
  }
  if (s.dataset.live !== String(live)) {
    s.innerHTML = `<span class="dot${live ? "" : " dot-dim"}"></span><span></span>`;
    s.dataset.live = String(live);
  }
  s.lastElementChild.textContent = text;
}

/* ================================================================== */
/* Calendar                                                            */
/* ================================================================== */

function renderCalendar(now) {
  const host = $("#cal");
  host.textContent = "";
  const today = todayNY(now);
  const wd = weekday(today);
  let day = addDays(today, -((wd + 6) % 7)); // Monday of this week
  let closedRun = 0;
  for (let i = 0; i < 14; i++) {
    const trading = isTradingDay(day);
    const hol = holidayName(day);
    const ts = bellAt(day);
    const isToday = dayKey(day) === dayKey(today);
    const cell = document.createElement("div");
    cell.className = "day-cell";
    cell.setAttribute("role", "listitem");
    const dateObj = new Date(Date.UTC(day.y, day.m - 1, day.d));
    const head = document.createElement("div"); head.className = "cc-head";
    head.innerHTML = `<span class="cc-wd"></span><span class="cc-date"></span>`;
    head.firstChild.textContent = dateObj.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    head.lastChild.textContent = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const mid = document.createElement("div"); mid.className = "cc-mid";
    const foot = document.createElement("div"); foot.className = "cc-foot";
    if (trading) {
      const img = document.createElement("img");
      img.src = "assets/bell-3d-sm.png"; img.alt = ""; img.width = 58; img.height = 58; img.loading = "lazy";
      mid.appendChild(img);
      if (ts <= now) { cell.classList.add("past"); foot.textContent = "Rang"; }
      else {
        foot.innerHTML = "<b></b> your time";
        foot.firstChild.textContent = localTime(ts);
      }
      if (closedRun > 0) {
        const tag = document.createElement("span"); tag.className = "cc-carry";
        tag.textContent = `Carries ${closedRun + 1} days`;
        cell.appendChild(tag);
      }
      closedRun = 0;
      cell.setAttribute("aria-label", `${head.firstChild.textContent} ${head.lastChild.textContent}: bell at ${localTime(ts)} your time`);
    } else {
      cell.classList.add("closed");
      const t = document.createElement("p"); t.className = "cc-closed"; t.textContent = hol || "Closed";
      mid.appendChild(t);
      foot.textContent = "Pot keeps filling";
      closedRun++;
      cell.setAttribute("aria-label", `${head.firstChild.textContent} ${head.lastChild.textContent}: ${hol || "closed"}, no bell`);
    }
    if (isToday) cell.classList.add("today");
    cell.append(head, mid, foot);
    host.appendChild(cell);
    day = addDays(day, 1);
  }
}

/* ================================================================== */
/* Your cut                                                            */
/* ================================================================== */

const holdInput = $("#hold");
function holdings() {
  const v = parseFloat(String(holdInput.value).replace(/[^0-9.]/g, ""));
  return isFinite(v) && v > 0 ? Math.min(v, C.supply) : 0;
}
function renderCut() {
  const h = holdings();
  const share = h / C.supply;
  const perBell = currentPot() * share;
  $("#share").textContent = (share * 100 >= 0.01 || share === 0 ? (share * 100).toFixed(2) : (share * 100).toPrecision(2)) + "%";
  $("#per-usd").textContent = usd.format(perBell);
  const l = state.leader;
  $("#per-units").textContent = l && l.price ? `${fmtUnits(perBell / l.price)} ${l.sym}` : "a share of the pot";
  $$(".chip").forEach((c) => c.setAttribute("aria-pressed", String(+c.dataset.v === h)));
}
function wireCut() {
  holdInput.addEventListener("input", renderCut);
  holdInput.addEventListener("blur", () => { const h = holdings(); holdInput.value = h ? int.format(h) : ""; renderCut(); });
  $$(".chip").forEach((c) => c.addEventListener("click", () => { holdInput.value = int.format(+c.dataset.v); renderCut(); }));
}

/* ================================================================== */
/* Layout bits                                                         */
/* ================================================================== */

function layoutWire() {
  // The wire runs from the top of the hero down to the bell's loop (about 24% into the frame).
  const h = anchorHero.getBoundingClientRect();
  const top = hero.getBoundingClientRect().top;
  hero.style.setProperty("--wire", Math.max(0, h.top - top + h.height * 0.238) + "px");
}

let scrollQueued = false;
function onScroll() {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    placeBell();
    updateDay();
  });
}

/* ================================================================== */
/* Boot                                                                */
/* ================================================================== */

function boot() {
  wireConfig();
  buildDial();
  wireCut();
  refreshBells(Date.now());
  if (C.simulate && !C.potEndpoint) $$(".js-sim").forEach((n) => { n.hidden = false; });
  layoutWire();
  updateDay();
  initBell();

  $("#ring-btn").addEventListener("click", () => { armSound(); ring("demo"); });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => { layoutWire(); onScroll(); });
  requestAnimationFrame(tick);

  loadBoard().catch(useReference);
  setInterval(() => { if (state.source && state.source !== "reference") refreshPrices(); }, 30000);
  if (C.potEndpoint) { pollPot(); setInterval(pollPot, 15000); }
  setInterval(() => renderLeader(), 5000);
}

boot();
