(() => {
  "use strict";

  const C = window.BELL;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SOL_MINT = "So11111111111111111111111111111111111111112";

  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const pad = (n) => String(n).padStart(2, "0");

  function fmtPrice(p) {
    if (p == null || !isFinite(p)) return "–";
    return usd.format(p);
  }
  function fmtChange(c) {
    if (c == null || !isFinite(c)) return "–";
    const sign = c > 0 ? "+" : c < 0 ? "−" : "";
    return sign + Math.abs(c).toFixed(2) + "%";
  }
  function dirClass(c) {
    if (c == null || !isFinite(c) || c === 0) return "flat";
    return c > 0 ? "up" : "down";
  }
  function fmtUnits(u) {
    if (!isFinite(u) || u <= 0) return "0";
    if (u >= 100) return u.toFixed(1);
    if (u >= 1) return u.toFixed(3);
    if (u >= 0.01) return u.toFixed(4);
    return u.toPrecision(3);
  }

  /* ------------------------------------------------------------------ */
  /* Market clock (New York)                                             */
  /* ------------------------------------------------------------------ */

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
      const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - guess;
      guess = target - offset;
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
  function isTradingDay(day) {
    const w = weekday(day);
    return w >= 1 && w <= 5 && !holidayName(day);
  }
  function bellAt(day) { return etToUtc(day.y, day.m, day.d, 9, 30); }

  function nextBell(now) {
    const p = etParts(now);
    let day = { y: p.y, m: p.m, d: p.d };
    for (let i = 0; i < 20; i++) {
      if (isTradingDay(day)) {
        const t = bellAt(day);
        if (t > now) return { ts: t, day };
      }
      day = addDays(day, 1);
    }
    return null;
  }
  function lastBell(now) {
    const p = etParts(now);
    let day = { y: p.y, m: p.m, d: p.d };
    for (let i = 0; i < 20; i++) {
      if (isTradingDay(day)) {
        const t = bellAt(day);
        if (t <= now) return { ts: t, day };
      }
      day = addDays(day, -1);
    }
    return { ts: now - 864e5, day };
  }
  function fmtCountdown(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
    return d > 0 ? `${d}d ${clock}` : clock;
  }
  const localTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const localWeekday = (ts) => new Date(ts).toLocaleDateString("en-US", { weekday: "long" });
  const sameLocalDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const utcDayLabel = (day) => new Date(Date.UTC(day.y, day.m - 1, day.d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const tzCity = (() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      const city = tz.split("/").pop().replace(/_/g, " ");
      return city && city !== "UTC" ? city : "";
    } catch { return ""; }
  })();

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  const state = {
    rows: [],            // board rows: {sym, name, price, change, icon, mint}
    leader: null,
    source: null,        // "jupiter" | "dexscreener" | "reference"
    updatedAt: 0,
    solPrice: C.sim.solFallback,
    last: null,          // last bell {ts, day}
    next: null,          // next bell {ts, day}
    fees: 0,             // simulated fees since last bell (USD)
    drained: 0,          // demo rings since last bell (USD)
    ringing: false,
    resultUntil: 0,
    feed: []
  };

  /* ------------------------------------------------------------------ */
  /* Static wiring                                                       */
  /* ------------------------------------------------------------------ */

  function wireConfig() {
    $$(".js-buy").forEach((a) => { a.href = C.buyUrl || "#"; });
    $$(".js-pot-share").forEach((el) => { el.textContent = C.potShare; });
    $$(".js-burn-share").forEach((el) => { el.textContent = C.burnShare; });
    $("#pair").textContent = C.pairedWith;
    $("#status-text").textContent = `Live on ${C.platform}`;
    if (!C.simulate) $("#sim-note").hidden = true;

    const x = $("#x-link");
    if (C.xUrl) { x.href = C.xUrl; x.hidden = false; }

    const ca = $("#ca");
    if (C.ca) {
      $("#ca-addr").textContent = C.ca.slice(0, 4) + "…" + C.ca.slice(-4);
      ca.hidden = false;
      ca.setAttribute("aria-label", "Copy the $BELL contract address");
      ca.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(C.ca);
        } catch {
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
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ------------------------------------------------------------------ */
  /* Dial                                                                */
  /* ------------------------------------------------------------------ */

  const CX = 260, CY = 260, R = 206, R_OUT = 228;
  const SVGNS = "http://www.w3.org/2000/svg";
  const toRad = (deg) => deg * Math.PI / 180;
  const angleOf = (min) => toRad(-90 + ((min - BELL_MIN) / 1440) * 360);
  const ptAt = (min, r) => [CX + r * Math.cos(angleOf(min)), CY + r * Math.sin(angleOf(min))];

  function arcPath(m0, span, r) {
    if (span <= 0.01) return "";
    const s = Math.min(span, 1439.95);
    const [x0, y0] = ptAt(m0, r);
    const [x1, y1] = ptAt(m0 + s, r);
    const large = s > 720 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  let progEl, tipEl, haloEl;
  function buildDial() {
    const svg = $("#dial-svg");
    const defs = el("defs", {}, svg);
    const lg = el("linearGradient", { id: "prog-grad", x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
    el("stop", { offset: "0", "stop-color": "#8fc6dc" }, lg);
    el("stop", { offset: "1", "stop-color": "#52e0a6" }, lg);
    const f = el("filter", { id: "glow", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
    el("feGaussianBlur", { stdDeviation: "2.2", result: "b" }, f);
    const m = el("feMerge", {}, f);
    el("feMergeNode", { in: "b" }, m);
    el("feMergeNode", { in: "SourceGraphic" }, m);
    const rg = el("radialGradient", { id: "core", cx: "50%", cy: "50%", r: "50%" }, defs);
    el("stop", { offset: "0", "stop-color": "#0f2029", "stop-opacity": "1" }, rg);
    el("stop", { offset: "1", "stop-color": "#0a1418", "stop-opacity": "0" }, rg);

    el("circle", { cx: CX, cy: CY, r: 168, fill: "url(#core)" }, svg);
    el("circle", { cx: CX, cy: CY, r: 250, class: "d-faint" }, svg);
    el("circle", { cx: CX, cy: CY, r: 150, class: "d-faint" }, svg);
    el("circle", { cx: CX, cy: CY, r: 168, class: "d-faint-2" }, svg);

    // Market segments on the outer band.
    el("path", { d: arcPath(BELL_MIN, CLOSE_MIN - BELL_MIN, R_OUT), class: "d-open" }, svg);
    el("path", { d: arcPath(CLOSE_MIN, 1440 - (CLOSE_MIN - BELL_MIN), R_OUT), class: "d-chain" }, svg);
    const [c0x, c0y] = ptAt(CLOSE_MIN, R_OUT - 7);
    const [c1x, c1y] = ptAt(CLOSE_MIN, R_OUT + 7);
    el("line", { x1: c0x, y1: c0y, x2: c1x, y2: c1y, class: "d-close-mark" }, svg);
    const [lx, ly] = ptAt(CLOSE_MIN, R_OUT + 22);
    const close = el("text", { x: lx, y: ly, class: "d-hour" }, svg);
    close.textContent = "16:00";

    // Track and hour ticks.
    el("circle", { cx: CX, cy: CY, r: R, class: "d-ring" }, svg);
    for (let h = 0; h < 24; h++) {
      const major = h % 6 === 0;
      const [x0, y0] = ptAt(h * 60, R - (major ? 12 : 7));
      const [x1, y1] = ptAt(h * 60, R - 2);
      el("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: "d-tick" + (major ? " d-tick-major" : "") }, svg);
      if (major) {
        const [tx, ty] = ptAt(h * 60, R - 26);
        const t = el("text", { x: tx, y: ty, class: "d-hour" }, svg);
        t.textContent = pad(h);
      }
    }
    // Half-hour minor ticks between hours.
    for (let h = 0; h < 24; h++) {
      const [x0, y0] = ptAt(h * 60 + 30, R - 4);
      const [x1, y1] = ptAt(h * 60 + 30, R - 2);
      el("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: "d-tick" }, svg);
    }

    progEl = el("path", { d: "", class: "d-prog" }, svg);
    haloEl = el("circle", { cx: CX, cy: CY - R, r: 9, class: "d-tip-halo" }, svg);
    tipEl = el("circle", { cx: CX, cy: CY - R, r: 4.5, class: "d-tip" }, svg);
  }

  function minutesSinceBell(now) {
    const p = etParts(now);
    const minOfDay = p.h * 60 + p.mi + p.s / 60;
    return (minOfDay - BELL_MIN + 1440) % 1440;
  }
  function drawProgress(span) {
    progEl.setAttribute("d", arcPath(BELL_MIN, span, R));
    const [x, y] = ptAt(BELL_MIN + span, R);
    tipEl.setAttribute("cx", x.toFixed(2)); tipEl.setAttribute("cy", y.toFixed(2));
    haloEl.setAttribute("cx", x.toFixed(2)); haloEl.setAttribute("cy", y.toFixed(2));
  }
  let introDone = false;
  function introDial() {
    const target = minutesSinceBell(Date.now());
    if (reduceMotion) { drawProgress(target); introDone = true; return; }
    const t0 = performance.now(), dur = 1700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      drawProgress(target * e);
      if (k < 1) requestAnimationFrame(step); else introDone = true;
    };
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ */
  /* Pot simulation                                                      */
  /* ------------------------------------------------------------------ */

  function potNow(now) {
    const hrs = Math.max(0, (now - state.last.ts) / 36e5);
    return Math.max(0, C.sim.potPerHour * hrs + state.fees - state.drained);
  }
  const rand = (a, b) => a + Math.random() * (b - a);

  function scheduleFee() {
    const [a, b] = C.sim.feeEveryMs;
    setTimeout(() => {
      const sol = rand(C.sim.feeSol[0], C.sim.feeSol[1]);
      const toPot = sol * state.solPrice * (C.potShare / 100);
      state.fees += toPot;
      pushFeed({ kind: "fee", label: "Trade fee", sol, amt: toPot, ts: Date.now() });
      scheduleFee();
    }, rand(a, b));
  }

  function pushFeed(item) {
    state.feed.unshift(item);
    state.feed = state.feed.slice(0, 4);
    renderFeed(true);
  }
  function ageText(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    return m < 60 ? m + "m" : Math.floor(m / 60) + "h";
  }
  function renderFeed(fresh) {
    const list = $("#feed");
    if (fresh) {
      list.textContent = "";
      state.feed.forEach((it, i) => {
        const li = document.createElement("li");
        if (it.kind === "bell") li.className = "f-bell";
        if (i > 0 || reduceMotion) li.style.animation = "none";
        const a = document.createElement("span"); a.textContent = it.label;
        const b = document.createElement("span"); b.className = "f-sol";
        b.textContent = it.kind === "bell" ? it.detail : it.sol.toFixed(4) + " SOL";
        const c = document.createElement("span"); c.className = "f-amt";
        c.textContent = it.kind === "bell" ? "−" + usd.format(it.amt) : "+" + usd.format(it.amt);
        const d = document.createElement("span"); d.className = "f-age"; d.dataset.ts = it.ts;
        d.textContent = ageText(it.ts);
        li.append(a, b, c, d);
        list.appendChild(li);
      });
    } else {
      $$(".f-age", list).forEach((n) => { n.textContent = ageText(+n.dataset.ts); });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Ringing                                                             */
  /* ------------------------------------------------------------------ */

  function spawnRipples() {
    if (reduceMotion) return;
    const host = $("#ripples");
    [0, 260, 520].forEach((delay) => {
      setTimeout(() => {
        const r = document.createElement("span");
        r.className = "ripple";
        host.appendChild(r);
        r.addEventListener("animationend", () => r.remove());
      }, delay);
    });
  }

  function ring(kind) {
    if (state.ringing) return;
    state.ringing = true;
    const now = Date.now();
    const pot = potNow(now);
    const lead = state.leader;
    const units = lead && lead.price ? pot / lead.price : 0;
    const dial = $("#dial");

    dial.classList.remove("ringing");
    void dial.offsetWidth;
    dial.classList.add("ringing", "rang");
    spawnRipples();

    // Result in the dial centre.
    $("#dc-label").textContent = kind === "demo" ? "Demo ring" : "The bell rang";
    const cd = $("#countdown");
    cd.classList.remove("long");
    cd.classList.add("result");
    cd.textContent = lead ? `${fmtUnits(units)} ${lead.sym}` : usd.format(pot);
    $("#dc-sub").textContent = `sent to ${int.format(C.sim.holders)} holders`;
    state.resultUntil = now + 5200;

    // Drain the pot on screen.
    const potEl = $("#pot");
    const t0 = performance.now(), dur = reduceMotion ? 1 : 1300;
    const drain = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      potEl.textContent = usd.format(pot * (1 - k));
      if (k < 1) requestAnimationFrame(drain);
    };
    requestAnimationFrame(drain);

    if (kind === "demo") state.drained += pot;

    pushFeed({
      kind: "bell",
      label: kind === "demo" ? "Demo bell" : "Bell",
      detail: lead ? `${fmtUnits(units)} ${lead.sym}` : "pot paid",
      amt: pot,
      ts: now
    });

    if (kind === "demo") toast(lead ? `Demo: ${fmtUnits(units)} ${lead.sym} to ${int.format(C.sim.holders)} holders` : "Demo ring");

    setTimeout(() => { dial.classList.remove("rang"); }, 900);
    setTimeout(() => { dial.classList.remove("ringing"); state.ringing = false; }, 1800);
  }

  /* ------------------------------------------------------------------ */
  /* Clock tick                                                          */
  /* ------------------------------------------------------------------ */

  function refreshBells(now) {
    state.last = lastBell(now);
    state.next = nextBell(now);
    state.fees = 0;
    state.drained = 0;
    renderHolidays(now);
  }

  let lastSecond = -1;
  function tick() {
    const now = Date.now();

    // A real bell just passed: ring, then start the next cycle.
    if (state.next && now >= state.next.ts) {
      ring("live");
      refreshBells(now);
    }

    const sec = Math.floor(now / 1000);
    if (sec !== lastSecond) {
      lastSecond = sec;
      const remaining = state.next.ts - now;
      const cdText = fmtCountdown(remaining);
      $("#end-countdown").textContent = cdText;

      if (now >= state.resultUntil) {
        const cd = $("#countdown");
        cd.classList.remove("result");
        cd.classList.toggle("long", remaining >= 864e5);
        cd.textContent = cdText;
        $("#dc-label").textContent = closedLabel(now);
        $("#dc-sub").textContent = subLabel(now);
        if (!state.ringing) $("#pot").textContent = usd.format(potNow(now));
      }

      if (introDone) drawProgress(minutesSinceBell(now));
      renderFeed(false);
      updateFine(now);
      renderCut();
      renderBoardStatus();
    }
    requestAnimationFrame(tick);
  }

  function closedLabel(now) {
    const p = etParts(now);
    const today = { y: p.y, m: p.m, d: p.d };
    const nextIsToday = state.next && dayKey(state.next.day) === dayKey(today);
    if (nextIsToday) return "Next bell in";
    const hol = holidayName(today);
    if (hol) return `${hol}. Next bell in`;
    const w = weekday(today);
    if (w === 0 || w === 6) return "Weekend. Next bell in";
    return "Next bell in";
  }
  function subLabel(now) {
    const p = etParts(now);
    const tomorrow = addDays({ y: p.y, m: p.m, d: p.d }, 1);
    const nd = state.next.day;
    if (dayKey(nd) === dayKey({ y: p.y, m: p.m, d: p.d }) || dayKey(nd) === dayKey(tomorrow)) return "09:30 in New York";
    return `${new Date(Date.UTC(nd.y, nd.m - 1, nd.d)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} 09:30 in New York`;
  }
  let lastFine = "";
  function updateFine(now) {
    const ts = state.next.ts;
    const where = tzCity ? `your time in ${tzCity}` : "your time";
    const when = sameLocalDay(ts, now) ? `today at <b>${localTime(ts)}</b>`
      : sameLocalDay(ts, now + 864e5) ? `tomorrow at <b>${localTime(ts)}</b>`
      : `<b>${localWeekday(ts)} at ${localTime(ts)}</b>`;
    const html = `The next bell rings ${when}, ${where}.`;
    if (html !== lastFine) { $("#local-bell").innerHTML = html; lastFine = html; }
  }

  /* ------------------------------------------------------------------ */
  /* Closed days                                                         */
  /* ------------------------------------------------------------------ */

  function renderHolidays(now) {
    const p = etParts(now);
    const todayKey = dayKey({ y: p.y, m: p.m, d: p.d });
    const upcoming = Object.keys(C.holidays || {}).filter((k) => k >= todayKey).sort().slice(0, 3);
    const list = $("#holidays");
    list.textContent = "";
    upcoming.forEach((k) => {
      const [y, m, d] = k.split("-").map(Number);
      const day = { y, m, d };
      let roll = addDays(day, 1);
      for (let i = 0; i < 10 && !isTradingDay(roll); i++) roll = addDays(roll, 1);
      const li = document.createElement("li");
      const a = document.createElement("span"); a.className = "h-date"; a.textContent = utcDayLabel(day);
      const b = document.createElement("span"); b.className = "h-name"; b.textContent = C.holidays[k];
      const c = document.createElement("span"); c.className = "h-roll"; c.textContent = `Pot rolls to ${utcDayLabel(roll)}`;
      li.append(a, b, c);
      list.appendChild(li);
    });
    if (!upcoming.length) {
      const li = document.createElement("li");
      li.textContent = "Add next year's closed days in config.js.";
      list.appendChild(li);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Prices                                                              */
  /* ------------------------------------------------------------------ */

  const JUP = ["https://api.jup.ag", "https://lite-api.jup.ag"];
  const CACHE_KEY = "bell.tokens.v1";

  async function getJSON(url, ms = 9000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }
  async function jup(path) {
    let err;
    for (const host of JUP) {
      try { return await getJSON(host + path); } catch (e) { err = e; }
    }
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
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (Date.now() - c.ts > 24 * 36e5) return null;
      return c.map;
    } catch { return null; }
  }
  function writeCache(map) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), map })); } catch {}
  }

  function baseRows() {
    return C.board.map(([sym, name]) => ({ sym, name, price: null, change: null, icon: null, mint: null }));
  }

  async function loadBoard() {
    const liveRows = baseRows();
    state.rows = liveRows;
    applyRows(); // names first, prices fill in as they arrive

    // If nothing has loaded after a few seconds, show reference prices meanwhile.
    const guard = setTimeout(() => { if (!state.source) useReference(); }, 7000);

    const cached = readCache();
    if (cached) {
      liveRows.forEach((r) => { const c = cached[r.sym]; if (c) { r.mint = c.mint; r.icon = c.icon; } });
      const ok = await refreshPrices();
      if (ok) { clearTimeout(guard); return; }
    }

    // Resolve each symbol, two at a time to stay inside free rate limits.
    const queue = liveRows.slice();
    let anySource = null;
    const worker = async () => {
      while (queue.length) {
        const row = queue.shift();
        const r = await resolveSymbol(row.sym);
        if (r) {
          Object.assign(row, { mint: r.mint, price: r.price, change: r.change, icon: r.icon || row.icon });
          anySource = anySource || r.src;
          state.rows = liveRows;
          state.source = anySource;
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
      refreshSol();
    } else {
      useReference();
    }
  }

  async function refreshSol() {
    try {
      const d = await jup(`/price/v3?ids=${SOL_MINT}`);
      const p = d && d[SOL_MINT] && num(d[SOL_MINT].usdPrice);
      if (p) state.solPrice = p;
    } catch {}
  }

  async function refreshPrices() {
    const rows = state.rows.filter((r) => r.mint);
    if (!rows.length) return false;
    const ids = rows.map((r) => r.mint).concat(SOL_MINT).join(",");
    try {
      const d = await jup(`/price/v3?ids=${ids}`);
      let hits = 0;
      rows.forEach((r) => {
        const q = d && d[r.mint];
        if (q && num(q.usdPrice)) {
          r.price = num(q.usdPrice);
          if (num(q.priceChange24h) != null) r.change = num(q.priceChange24h);
          hits++;
        }
      });
      const sol = d && d[SOL_MINT] && num(d[SOL_MINT].usdPrice);
      if (sol) state.solPrice = sol;
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
      rows.forEach((r) => {
        const b = best[r.mint];
        if (b && b.price) { r.price = b.price; r.change = b.change; hits++; }
      });
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
    const unpriced = state.rows.filter((r) => r.price == null);
    state.leader = sorted.find((r) => r.change != null) || sorted[0] || null;
    renderBoard(sorted.concat(unpriced));
    renderTape(sorted);
    renderLeader();
    renderCut();
    renderBoardStatus();
  }

  /* ------------------------------------------------------------------ */
  /* Board, tape, leader                                                 */
  /* ------------------------------------------------------------------ */

  function renderBoard(rows) {
    const host = $("#board-rows");
    host.textContent = "";
    const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.change || 0)));
    rows.forEach((r, i) => {
      const isLead = state.leader && r.sym === state.leader.sym;
      const row = document.createElement("div");
      row.className = "brow" + (isLead ? " lead" : "");
      row.setAttribute("role", "row");

      const rank = document.createElement("span");
      rank.className = "c-rank"; rank.setAttribute("role", "cell");
      rank.textContent = r.price != null ? i + 1 : "";

      const stock = document.createElement("span");
      stock.className = "stock"; stock.setAttribute("role", "cell");
      const ico = document.createElement("span");
      ico.className = "s-ico";
      if (r.icon) {
        const img = document.createElement("img");
        img.src = r.icon; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
        img.addEventListener("error", () => { img.remove(); ico.textContent = r.sym[0]; });
        ico.appendChild(img);
      } else {
        ico.textContent = r.sym[0];
      }
      const txt = document.createElement("span"); txt.className = "s-txt";
      const sym = document.createElement("span"); sym.className = "s-sym"; sym.textContent = r.sym;
      if (isLead) {
        const tag = document.createElement("span"); tag.className = "s-tag"; tag.textContent = "Next in line";
        sym.appendChild(tag);
      }
      const name = document.createElement("span"); name.className = "s-name"; name.textContent = r.name;
      txt.append(sym, name);
      stock.append(ico, txt);

      const px = document.createElement("span");
      px.className = "c-r b-px"; px.setAttribute("role", "cell");
      px.textContent = fmtPrice(r.price);

      const ch = document.createElement("span");
      ch.className = "c-r b-ch " + dirClass(r.change); ch.setAttribute("role", "cell");
      ch.textContent = fmtChange(r.change);

      const barCell = document.createElement("span");
      barCell.className = "bar-cell"; barCell.setAttribute("role", "cell");
      const bar = document.createElement("span"); bar.className = "bar"; bar.style.display = "block";
      if (r.change != null && r.change !== 0) {
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
    const make = (r) => {
      const item = document.createElement("span");
      item.className = "tape-item";
      item.dataset.sym = r.sym;
      const s = document.createElement("span"); s.className = "t-sym"; s.textContent = r.sym.replace(/x$/, "");
      const p = document.createElement("span"); p.className = "t-px"; p.textContent = fmtPrice(r.price);
      const c = document.createElement("span"); c.className = "t-ch " + dirClass(r.change); c.textContent = fmtChange(r.change);
      item.append(s, p, c);
      return item;
    };
    if (!tapeBuilt || track.children.length !== rows.length * 2) {
      track.textContent = "";
      track.classList.remove("run");
      const list = rows.slice().sort((a, b) => a.sym.localeCompare(b.sym));
      // Two identical halves make the loop seamless.
      list.concat(list).forEach((r) => track.appendChild(make(r)));
      track.style.setProperty("--tape-dur", Math.max(30, list.length * 6) + "s");
      if (!reduceMotion) track.classList.add("run");
      tapeBuilt = true;
    }
    rows.forEach((r) => {
      $$(`.tape-item[data-sym="${r.sym}"]`, track).forEach((item) => {
        item.querySelector(".t-px").textContent = fmtPrice(r.price);
        const c = item.querySelector(".t-ch");
        c.className = "t-ch " + dirClass(r.change);
        c.textContent = fmtChange(r.change);
        const isLead = state.leader && state.leader.sym === r.sym;
        let tag = item.querySelector(".t-lead");
        if (isLead && !tag) {
          tag = document.createElement("span"); tag.className = "t-lead"; tag.textContent = "Next in line";
          item.appendChild(tag);
        } else if (!isLead && tag) tag.remove();
      });
    });
  }

  function renderLeader() {
    const n = $("#next-line");
    const l = state.leader;
    if (!l) { n.textContent = "Reading the board"; return; }
    n.innerHTML = "";
    n.append("Next in line ");
    const b = document.createElement("b");
    b.textContent = `${l.sym} ${fmtChange(l.change)}`;
    n.appendChild(b);
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
    $("#sim-note").textContent = live ? "Simulated pot on live stock prices." : "Simulated pot on reference stock prices.";
    const html = `<span class="dot${live ? "" : " dot-dim"}"></span><span></span>`;
    if (s.dataset.live !== String(live)) { s.innerHTML = html; s.dataset.live = String(live); }
    s.lastElementChild.textContent = text;
  }

  /* ------------------------------------------------------------------ */
  /* Your cut                                                            */
  /* ------------------------------------------------------------------ */

  const holdInput = $("#hold");
  function holdings() {
    const v = parseFloat(String(holdInput.value).replace(/[^0-9.]/g, ""));
    return isFinite(v) && v > 0 ? Math.min(v, C.supply) : 0;
  }
  function renderCut() {
    const h = holdings();
    const share = h / C.supply;
    const pot = state.last ? potNow(Date.now()) : 0;
    const perBell = pot * share;
    $("#share").textContent = (share * 100 >= 0.01 || share === 0 ? (share * 100).toFixed(2) : (share * 100).toPrecision(2)) + "%";
    $("#per-usd").textContent = usd.format(perBell);
    const l = state.leader;
    $("#per-units").textContent = l && l.price ? `${fmtUnits(perBell / l.price)} ${l.sym}` : "a share of the pot";
    $("#per-week").textContent = usd.format(perBell * 5);
    $$(".chip").forEach((c) => c.setAttribute("aria-pressed", String(+c.dataset.v === h)));
  }
  function wireCut() {
    holdInput.addEventListener("input", renderCut);
    holdInput.addEventListener("blur", () => {
      const h = holdings();
      holdInput.value = h ? int.format(h) : "";
      renderCut();
    });
    $$(".chip").forEach((c) => c.addEventListener("click", () => {
      holdInput.value = int.format(+c.dataset.v);
      renderCut();
    }));
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  function boot() {
    wireConfig();
    buildDial();
    wireCut();
    refreshBells(Date.now());
    introDial();
    $("#ring-btn").addEventListener("click", () => ring("demo"));
    if (C.simulate) {
      // Start the feed with a few recent fees so it never opens empty.
      const t = Date.now();
      state.feed = [6, 15, 31].map((ago) => {
        const sol = rand(C.sim.feeSol[0], C.sim.feeSol[1]);
        return { kind: "fee", label: "Trade fee", sol, amt: sol * state.solPrice * (C.potShare / 100), ts: t - ago * 1000 };
      });
      renderFeed(true);
      scheduleFee();
    }
    requestAnimationFrame(tick);

    loadBoard().catch(useReference);
    setInterval(() => {
      if (state.source && state.source !== "reference") refreshPrices();
    }, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
