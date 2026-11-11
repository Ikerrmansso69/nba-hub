// ---------- Mercado de predicciones: apuesta monedas virtuales (sin dinero real) ----------
const Mercado = {
  START: 1000,
  BONUS: 100,
  MAX_DAYS: 4,
  store: (() => {
    try { return JSON.parse(localStorage.getItem("nbahub-mercado") || "null"); } catch { return null; }
  })() ?? null,
  friends: (() => { try { return JSON.parse(localStorage.getItem("nbahub-mercado-friends") || "{}"); } catch { return {}; } })(),
  games: [],
  day: null,
  slip: null, // selección pendiente de confirmar
  timer: null,

  init() {
    if (!this.store || typeof this.store.coins !== "number" || !Array.isArray(this.store.bets)) {
      this.store = { coins: this.START, bets: [], bonus: "", since: Date.now() };
      this.save();
    }
  },
  save() { try { localStorage.setItem("nbahub-mercado", JSON.stringify(this.store)); } catch {} },
  saveFriends() { try { localStorage.setItem("nbahub-mercado-friends", JSON.stringify(this.friends)); } catch {} },
  get name() { return (typeof Porra !== "undefined" && Porra.myName) || ""; },
  set name(v) {
    if (typeof Porra !== "undefined") Porra.myName = v;
    try { localStorage.setItem("nbahub-porra-name", v); } catch {}
  },

  async open() {
    this.init();
    const el = $("#mercado-board");
    if (!this.games.length) skeleton(el, 3, 180);
    await this.load();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.load(true), 60000);
  },
  stop() { clearInterval(this.timer); this.timer = null; },

  async load(silent = false) {
    try {
      const now = new Date();
      const all = await Api.scoreboard(new Date(+now - 86400000), new Date(+now + this.MAX_DAYS * 86400000), true);
      this.games = all;
      await this.settle(all);
      const days = this.days();
      if (!this.day || !days.includes(this.day)) {
        const firstOpen = all.find((g) => this.isOpen(g));
        this.day = firstOpen ? this.etDay(firstOpen.date) : days.at(-1) ?? null;
      }
      this.render();
    } catch {
      if (!silent) empty($("#mercado-board"), "No se pudo cargar el mercado. Inténtalo de nuevo en un momento.");
    }
  },

  // Se puede apostar hasta la hora de inicio (aunque los datos aún digan "por jugar")
  isOpen: (g) => g.state === "pre" && Date.now() < +g.date,
  etDay: (d) => new Date(+d - 5 * 3600e3).toISOString().slice(0, 10),
  days() { return [...new Set(this.games.map((g) => this.etDay(g.date)))].sort(); },

  // ---------- Cuotas ----------
  // Si ESPN publica las cuotas de la casa, se usan; si no, se estiman con el balance de cada equipo.
  winPct(rec) {
    const [w, l] = String(rec || "").split("-").map((n) => parseInt(n, 10));
    if (!isFinite(w) || !isFinite(l)) return 0.5;
    return (w + 2) / (w + l + 4); // suavizado para principio de temporada
  },
  price(p) { return Math.min(15, Math.max(1.05, Math.round((1 / (p * 1.045)) * 100) / 100)); },
  half(x) { return Math.floor(x) + 0.5; },

  lines(g) {
    const o = g.odds;
    const ph0 = this.winPct(g.home.record), pa0 = this.winPct(g.away.record);
    // log5 + ventaja de jugar en casa
    let pHome = (ph0 * (1 - pa0)) / (ph0 * (1 - pa0) + pa0 * (1 - ph0));
    pHome = Math.min(0.92, Math.max(0.08, pHome + 0.06));
    const est = { pHome };
    const margin = 7.4 * Math.log(pHome / (1 - pHome)); // puntos de ventaja esperados del local
    const res = {
      source: o?.provider || null,
      mlHome: o?.mlHome ?? this.price(pHome),
      mlAway: o?.mlAway ?? this.price(1 - pHome),
      spread: o?.spread ?? -this.half(Math.abs(margin)) * Math.sign(margin || 1),
      spHome: o?.spHome ?? 1.91,
      spAway: o?.spAway ?? 1.91,
      total: o?.total ?? 229.5,
      over: o?.over ?? 1.91,
      under: o?.under ?? 1.91,
      estimated: !o?.mlHome,
    };
    // Probabilidad implícita (sin el margen de la casa) para la barra
    const ih = 1 / res.mlHome, ia = 1 / res.mlAway;
    res.pHome = o?.mlHome && o?.mlAway ? ih / (ih + ia) : est.pHome;
    return res;
  },

  options(g) {
    const L = this.lines(g);
    const sgn = (n) => (n > 0 ? `+${n}` : `${n}`);
    return {
      L,
      ml: [
        { side: "away", label: g.away.short, odds: L.mlAway },
        { side: "home", label: g.home.short, odds: L.mlHome },
      ],
      spread: [
        { side: "away", label: `${g.away.abbr.toUpperCase()} ${sgn(-L.spread)}`, line: -L.spread, odds: L.spAway },
        { side: "home", label: `${g.home.abbr.toUpperCase()} ${sgn(L.spread)}`, line: L.spread, odds: L.spHome },
      ],
      total: [
        { side: "over", label: `Más de ${L.total}`, line: L.total, odds: L.over },
        { side: "under", label: `Menos de ${L.total}`, line: L.total, odds: L.under },
      ],
    };
  },

  MARKETS: { ml: "Ganador", spread: "Hándicap", total: "Puntos totales" },

  // ---------- Liquidación ----------
  outcome(b, g) {
    const hs = +g.home.score, as = +g.away.score;
    if (!isFinite(hs) || !isFinite(as)) return null;
    if (b.market === "ml") return (b.side === "home" ? hs > as : as > hs) ? "won" : "lost";
    if (b.market === "spread") {
      const diff = b.side === "home" ? hs + b.line - as : as + b.line - hs;
      return diff > 0 ? "won" : diff < 0 ? "lost" : "push";
    }
    if (b.market === "total") {
      const sum = hs + as;
      if (sum === b.line) return "push";
      return (b.side === "over" ? sum > b.line : sum < b.line) ? "won" : "lost";
    }
    return null;
  },

  async settle(known) {
    const open = this.store.bets.filter((b) => b.status === "open");
    if (!open.length) return;
    const byId = new Map(known.map((g) => [g.id, g]));
    const missing = open.filter((b) => !byId.has(b.gid) && Date.now() - b.date < 30 * 86400000);
    if (missing.length) {
      try {
        const first = new Date(Math.min(...missing.map((b) => b.date)) - 86400000);
        (await Api.scoreboard(first, new Date())).forEach((g) => byId.set(g.id, g));
      } catch {}
    }
    let won = 0, changed = false;
    open.forEach((b) => {
      const g = byId.get(b.gid);
      if (!g || g.state !== "post") return;
      const r = this.outcome(b, g);
      if (!r) return;
      b.status = r;
      b.final = `${g.away.abbr.toUpperCase()} ${g.away.score}-${g.home.score} ${g.home.abbr.toUpperCase()}`;
      b.payout = r === "won" ? Math.round(b.stake * b.odds) : r === "push" ? b.stake : 0;
      this.store.coins += b.payout;
      if (r === "won") won += b.payout - b.stake;
      changed = true;
    });
    if (changed) {
      this.save();
      if (won > 0) toast(`🪙 ¡Has ganado <b>${won}</b> monedas en el mercado!`, "#mercado");
    }
  },

  stats(bets = this.store.bets) {
    const done = bets.filter((b) => b.status !== "open");
    const graded = done.filter((b) => b.status !== "push");
    const hits = graded.filter((b) => b.status === "won").length;
    const staked = done.reduce((s, b) => s + b.stake, 0);
    const profit = done.reduce((s, b) => s + b.payout - b.stake, 0);
    const inPlay = bets.filter((b) => b.status === "open").reduce((s, b) => s + b.stake, 0);
    return { hits, total: graded.length, pct: graded.length ? Math.round((hits / graded.length) * 100) : 0, profit, roi: staked ? Math.round((profit / staked) * 100) : 0, inPlay };
  },

  canBonus() { return this.store.bonus !== new Date().toISOString().slice(0, 10); },

  // ---------- Pintar ----------
  render() {
    this.renderWallet();
    this.renderBoard();
    this.renderSlip();
    this.renderBets();
    this.renderLeague();
  },

  renderWallet() {
    const st = this.stats();
    const el = $("#mercado-wallet");
    el.innerHTML = `
      <div class="porra-stats mk-wallet">
        <div><b>${this.store.coins.toLocaleString("es-ES")}</b><span>🪙 Saldo</span></div>
        <div><b class="${st.profit > 0 ? "up" : st.profit < 0 ? "down" : ""}">${st.profit > 0 ? "+" : ""}${st.profit.toLocaleString("es-ES")}</b><span>Beneficio · ROI ${st.roi}%</span></div>
        <div><b>${st.hits}/${st.total}</b><span>Aciertos (${st.pct}%)</span></div>
        <div><b>${st.inPlay.toLocaleString("es-ES")}</b><span>En juego</span></div>
      </div>
      <div class="mk-bonus">
        ${this.canBonus() ? `<button class="btn primary" id="mk-bonus">🎁 Recoger ${this.BONUS} 🪙 de hoy</button>` : `<span class="muted">Recarga diaria recogida · vuelve mañana</span>`}
        <span class="muted">Monedas virtuales, sin dinero real. Todo se guarda en tu navegador.</span>
      </div>`;
    $("#mk-bonus")?.addEventListener("click", () => {
      if (!this.canBonus()) return;
      this.store.coins += this.BONUS;
      this.store.bonus = new Date().toISOString().slice(0, 10);
      this.save();
      toast(`🎁 +${this.BONUS} monedas`);
      this.render();
    });
  },

  renderBoard() {
    const el = $("#mercado-board");
    const days = this.days();
    const games = this.games.filter((g) => this.etDay(g.date) === this.day);
    const dayTxt = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
    const mine = (gid, market, side) => this.store.bets.some((b) => b.gid === gid && b.market === market && b.side === side);
    const card = (g) => {
      const O = this.options(g);
      const open = this.isOpen(g);
      const sel = this.slip && this.slip.gid === g.id ? this.slip : null;
      const status = g.state === "pre" ? (open ? fmtTime(g.date) : "Cerrado") : g.state === "in" ? `<span class="live">EN VIVO</span> ${esc(g.away.score)}-${esc(g.home.score)}` : `Final ${esc(g.away.score)}-${esc(g.home.score)}`;
      const pH = Math.round(O.L.pHome * 100);
      const row = (key) => `
        <div class="mk-market"><span class="mk-mname">${this.MARKETS[key]}</span>
          ${O[key].map((x) => `<button class="mk-odd ${sel && sel.market === key && sel.side === x.side ? "on" : ""} ${mine(g.id, key, x.side) ? "mine" : ""}" ${open ? "" : "disabled"}
            data-gid="${esc(g.id)}" data-market="${key}" data-side="${x.side}"><span>${esc(x.label)}</span><b>${x.odds.toFixed(2)}</b></button>`).join("")}
        </div>`;
      return `<article class="mk-card ${open ? "" : "closed"}">
        <header class="mk-head">
          <a href="#partido/${esc(g.id)}" class="mk-team"><img src="${esc(g.away.logo || LOGO(g.away.abbr))}" alt="" /><span><strong>${esc(g.away.short)}</strong><small>${esc(g.away.record)}</small></span></a>
          <div class="mk-status">${status}</div>
          <a href="#partido/${esc(g.id)}" class="mk-team home"><span><strong>${esc(g.home.short)}</strong><small>${esc(g.home.record)}</small></span><img src="${esc(g.home.logo || LOGO(g.home.abbr))}" alt="" /></a>
        </header>
        <div class="mk-prob" title="Probabilidad según el mercado"><i style="width:${100 - pH}%;--c:${colorOf(g.away.abbr)}"></i><i style="width:${pH}%;--c:${colorOf(g.home.abbr)}"></i></div>
        <div class="mk-probtxt"><span>${100 - pH}%</span><small>${O.L.estimated ? "Cuotas estimadas por NBA Hub" : `Cuotas de ${esc(O.L.source)}`}</small><span>${pH}%</span></div>
        ${row("ml")}${row("spread")}${row("total")}
      </article>`;
    };
    el.innerHTML = `
      ${days.length ? `<div class="seg small mk-days">${days.map((d) => `<button data-day="${d}" class="${d === this.day ? "active" : ""}">${esc(dayTxt(d))}</button>`).join("")}</div>` : ""}
      <div class="mk-grid">${games.length ? games.map(card).join("") : `<p class="muted">No hay partidos en los próximos días.</p>`}</div>`;
    $$(".mk-days button", el).forEach((b) => b.addEventListener("click", () => { this.day = b.dataset.day; this.renderBoard(); }));
    $$(".mk-odd", el).forEach((b) => b.addEventListener("click", () => {
      const g = this.games.find((x) => x.id === b.dataset.gid);
      if (!g || !this.isOpen(g)) return;
      const opt = this.options(g)[b.dataset.market].find((x) => x.side === b.dataset.side);
      const same = this.slip && this.slip.gid === g.id && this.slip.market === b.dataset.market && this.slip.side === b.dataset.side;
      this.slip = same ? null : { gid: g.id, market: b.dataset.market, side: opt.side, line: opt.line ?? null, odds: opt.odds, label: opt.label, game: `${g.away.short} @ ${g.home.short}`, date: +g.date, stake: this.slip?.stake ?? 50 };
      this.renderBoard();
      this.renderSlip();
    }));
  },

  renderSlip() {
    const el = $("#mercado-slip");
    const s = this.slip;
    if (!s) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    const max = this.store.coins;
    const stake = Math.max(0, Math.min(max, Math.floor(+s.stake || 0)));
    el.innerHTML = `
      <div class="mk-slip-in">
        <div class="mk-slip-sel">
          <small>${this.MARKETS[s.market]} · ${esc(s.game)}</small>
          <strong>${esc(s.label)} <b>@ ${s.odds.toFixed(2)}</b></strong>
        </div>
        <div class="mk-slip-stake">
          <input type="number" id="mk-stake" min="1" max="${max}" step="1" value="${stake}" aria-label="Monedas a apostar" inputmode="numeric" />
          <div class="mk-chips">${[10, 50, 100, 250].map((n) => `<button data-add="${n}">+${n}</button>`).join("")}<button data-all>Todo</button></div>
        </div>
        <div class="mk-slip-go">
          <small>Ganancia posible</small>
          <strong id="mk-win">${Math.round(stake * s.odds).toLocaleString("es-ES")} 🪙</strong>
          <div class="mk-slip-btns"><button class="btn" id="mk-cancel">Quitar</button><button class="btn primary" id="mk-place" ${stake < 1 ? "disabled" : ""}>Apostar</button></div>
        </div>
      </div>`;
    const input = $("#mk-stake");
    const sync = () => {
      s.stake = Math.max(0, Math.min(max, Math.floor(+input.value || 0)));
      $("#mk-win").textContent = `${Math.round(s.stake * s.odds).toLocaleString("es-ES")} 🪙`;
      $("#mk-place").disabled = s.stake < 1;
    };
    input.addEventListener("input", sync);
    $$("[data-add]", el).forEach((b) => b.addEventListener("click", () => { input.value = Math.min(max, (Math.floor(+input.value) || 0) + +b.dataset.add); sync(); }));
    $("[data-all]", el).addEventListener("click", () => { input.value = max; sync(); });
    $("#mk-cancel").addEventListener("click", () => { this.slip = null; this.renderBoard(); this.renderSlip(); });
    $("#mk-place").addEventListener("click", () => this.place());
  },

  place() {
    const s = this.slip;
    const g = this.games.find((x) => x.id === s?.gid);
    if (!s || !g) return;
    if (!this.isOpen(g)) { toast("Este partido ya ha empezado: el mercado está cerrado."); this.slip = null; return this.render(); }
    const stake = Math.floor(+s.stake);
    if (!(stake >= 1)) return toast("Elige cuántas monedas quieres apostar.");
    if (stake > this.store.coins) return toast("No tienes monedas suficientes.");
    this.store.coins -= stake;
    this.store.bets.push({
      id: `${s.gid}-${s.market}-${s.side}-${Date.now()}`, gid: s.gid, market: s.market, side: s.side, line: s.line, odds: s.odds,
      label: s.label, game: s.game, date: s.date, stake, t: Date.now(), status: "open", payout: 0,
    });
    this.save();
    toast(`✅ Apuesta hecha: <b>${esc(s.label)}</b> · ${stake} 🪙 a ${s.odds.toFixed(2)}`);
    this.slip = null;
    this.render();
  },

  renderBets() {
    const el = $("#mercado-bets");
    const bets = this.store.bets.slice().sort((a, b) => b.t - a.t);
    const open = bets.filter((b) => b.status === "open");
    const done = bets.filter((b) => b.status !== "open").slice(0, 25);
    const tag = { won: ["ok", "Ganada"], lost: ["ko", "Perdida"], push: ["", "Nula"] };
    const row = (b) => `
      <a class="mk-bet ${b.status}" href="#partido/${esc(b.gid)}">
        <span class="mk-bet-main"><strong>${esc(b.label)} <b>@ ${b.odds.toFixed(2)}</b></strong><small>${this.MARKETS[b.market]} · ${esc(b.final || b.game)}${b.status === "open" ? ` · ${esc(fmtDate(new Date(b.date)))} ${esc(fmtTime(new Date(b.date)))}` : ""}</small></span>
        <span class="mk-bet-amt">${b.status === "open"
          ? `<small>${b.stake} 🪙 → </small><b>${Math.round(b.stake * b.odds)}</b>`
          : `<span class="verdict ${tag[b.status][0]}">${tag[b.status][1]}</span><b class="${b.payout > b.stake ? "up" : b.payout < b.stake ? "down" : ""}">${b.payout - b.stake > 0 ? "+" : ""}${b.payout - b.stake}</b>`}</span>
      </a>`;
    el.innerHTML = `
      <div class="card-block">
        <div class="porra-head"><h3>Apuestas abiertas</h3><span class="muted">${open.length ? `${open.length} en juego` : ""}</span></div>
        ${open.length ? open.map(row).join("") : `<p class="muted">Aún no tienes apuestas abiertas. Pulsa una cuota para empezar.</p>`}
      </div>
      ${done.length ? `<div class="card-block"><div class="porra-head"><h3>Historial</h3>
        <button class="link-btn" id="mk-reset">Empezar de cero</button></div>${done.map(row).join("")}</div>` : ""}`;
    $("#mk-reset")?.addEventListener("click", () => {
      if (!confirm("¿Borrar tus apuestas y volver a empezar con 1.000 monedas?")) return;
      this.store = null;
      try { localStorage.removeItem("nbahub-mercado"); } catch {}
      this.init();
      this.render();
    });
  },

  // ---------- Ranking con amigos (sin servidor: cada uno comparte un código con su balance) ----------
  myCode() {
    const st = this.stats();
    const json = JSON.stringify({ n: this.name || "Anónimo", c: this.store.coins, pr: st.profit, h: st.hits, g: st.total, r: st.roi, t: Math.round(Date.now() / 60000) });
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },

  decode(code) {
    try {
      const b = String(code).trim().replace(/^.*\/liga\//, "").replace(/-/g, "+").replace(/_/g, "/");
      const o = JSON.parse(decodeURIComponent(escape(atob(b))));
      const num = (x) => (isFinite(+x) ? Math.round(+x) : 0);
      if (!o || !("c" in o)) return null;
      return { n: String(o.n ?? "Amigo").slice(0, 24), c: num(o.c), pr: num(o.pr), h: num(o.h), g: num(o.g), r: num(o.r), t: num(o.t) * 60000 };
    } catch { return null; }
  },

  addFriend(code) {
    this.init();
    const f = this.decode(code);
    if (!f) return toast("Ese código no es válido.");
    if (f.n === (this.name || "Anónimo") && f.c === this.store.coins) return toast("Ese es tu propio código 😉");
    const prev = this.friends[f.n];
    if (prev && prev.t > f.t) return toast(`Ya tenías un código más reciente de ${esc(f.n)}.`);
    this.friends[f.n] = f;
    this.saveFriends();
    toast(`👥 ${esc(f.n)} está en tu ranking del mercado`);
    if ($("#mercado-league")) this.renderLeague();
  },

  renderLeague() {
    const el = $("#mercado-league");
    if (!el) return;
    const st = this.stats();
    const me = { n: this.name || "Tú", c: this.store.coins, pr: st.profit, h: st.hits, g: st.total, r: st.roi, me: true };
    const rows = [me, ...Object.values(this.friends)].sort((a, b) => b.c - a.c || b.pr - a.pr);
    el.innerHTML = `
      <div class="card-block league">
        <div class="porra-head"><h3>Ranking con amigos</h3><span class="muted">Gana quien tenga más monedas</span></div>
        <div class="league-me">
          <div class="search"><input type="text" id="mk-name" maxlength="24" placeholder="Tu nombre en el ranking" value="${esc(this.name)}" aria-label="Tu nombre en el ranking" /></div>
          <button class="btn primary" id="mk-share">Invitar / compartir mi saldo</button>
        </div>
        <form class="league-add" id="mk-add">
          <div class="search"><input type="text" id="mk-code" placeholder="Pega aquí el código o enlace de un amigo" aria-label="Código de un amigo" /></div>
          <button class="btn" type="submit">Añadir</button>
        </form>
        <div class="table-wrap"><table class="table compact league-table">
          <thead><tr><th>#</th><th>Jugador</th><th>Saldo</th><th>Beneficio</th><th>Aciertos</th><th></th></tr></thead>
          <tbody>${rows.map((r, i) => `<tr class="${r.me ? "me" : ""}">
            <td class="num">${i + 1}${i === 0 ? " 👑" : ""}</td>
            <td><strong>${esc(r.n)}</strong>${r.me ? " <small class='muted'>(tú)</small>" : r.t ? ` <small class="muted">${esc(fmtDate(new Date(r.t)))}</small>` : ""}</td>
            <td class="num">${r.c.toLocaleString("es-ES")}</td>
            <td class="num ${r.pr > 0 ? "up" : r.pr < 0 ? "down" : ""}">${r.pr > 0 ? "+" : ""}${r.pr}</td>
            <td class="num">${r.h}/${r.g}</td>
            <td>${r.me ? "" : `<button class="link-btn" data-remove="${esc(r.n)}" aria-label="Quitar a ${esc(r.n)}">Quitar</button>`}</td>
          </tr>`).join("")}</tbody>
        </table></div>
        <p class="muted note">El saldo de tus amigos se actualiza cuando te vuelven a mandar su enlace.</p>
      </div>`;
    $("#mk-name").addEventListener("change", (e) => { this.name = e.target.value.trim().slice(0, 24); this.renderLeague(); });
    $("#mk-share").addEventListener("click", async () => {
      if (!this.name) { $("#mk-name").focus(); return toast("Pon primero tu nombre para el ranking."); }
      const url = `https://ikerrmansso69.github.io/nba-hub/#mercado/liga/${this.myCode()}`;
      const text = `🏀 Tengo ${this.store.coins} 🪙 en el Mercado de predicciones de NBA Hub. ¿Me superas? Abre el enlace y mándame el tuyo:`;
      try {
        if (navigator.share) await navigator.share({ title: "Mercado NBA Hub", text, url });
        else { await navigator.clipboard.writeText(`${text}\n${url}`); toast("Enlace copiado. ¡Mándaselo a tus amigos!"); }
      } catch {}
    });
    $("#mk-add").addEventListener("submit", (e) => { e.preventDefault(); this.addFriend($("#mk-code").value); });
    $$("[data-remove]", el).forEach((b) => b.addEventListener("click", () => {
      delete this.friends[b.dataset.remove];
      this.saveFriends();
      this.renderLeague();
    }));
  },
};
