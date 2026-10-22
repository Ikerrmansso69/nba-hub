// ---------- Multi-partido: hasta 4 partidos a la vez + avisos de finales apretados ----------
const Multi = {
  sel: [],
  timer: null,
  games: [],

  async open() {
    this.stop();
    await this.load();
  },
  stop() { clearTimeout(this.timer); this.timer = null; },

  async load() {
    try {
      this.games = await Api.scoreboard(Tonight.day(), Tonight.day(), true);
    } catch { this.games = []; }
    // Por defecto: los partidos en directo (y si no hay, los próximos)
    const valid = this.sel.filter((id) => this.games.some((g) => g.id === id));
    if (!valid.length) {
      const order = favFirst([...this.games.filter((g) => g.state === "in"), ...this.games.filter((g) => g.state === "pre"), ...this.games.filter((g) => g.state === "post")]);
      this.sel = order.slice(0, 4).map((g) => g.id);
    } else this.sel = valid;
    this.renderPicker();
    await this.renderBoards();
    if ($("#multi").classList.contains("active")) this.timer = setTimeout(() => this.load(), this.games.some((g) => g.state === "in") ? 15000 : 60000);
  },

  renderPicker() {
    const el = $("#multi-picker");
    if (!this.games.length) return empty(el, "Hoy no hay partidos.");
    el.innerHTML = this.games.map((g) => `
      <button class="mp ${this.sel.includes(g.id) ? "on" : ""} ${g.state === "in" ? "live" : ""}" data-id="${esc(g.id)}" aria-pressed="${this.sel.includes(g.id)}">
        <img src="${esc(g.away.logo || LOGO(g.away.abbr))}" alt="" />${esc(g.away.abbr.toUpperCase())}
        <span>${g.state === "pre" ? fmtTime(g.date) : `${esc(g.away.score)}-${esc(g.home.score)}`}</span>
        ${esc(g.home.abbr.toUpperCase())}<img src="${esc(g.home.logo || LOGO(g.home.abbr))}" alt="" />
      </button>`).join("");
    $$(".mp", el).forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.id;
      if (this.sel.includes(id)) this.sel = this.sel.filter((x) => x !== id);
      else { this.sel.push(id); if (this.sel.length > 4) this.sel.shift(); }
      this.renderPicker();
      this.renderBoards();
    }));
  },

  async renderBoards() {
    const el = $("#multi-boards");
    if (!this.sel.length) return empty(el, "Elige hasta 4 partidos arriba.");
    el.className = `multi-boards n${this.sel.length}`;
    const boards = await Promise.all(this.sel.map((id) => Api.summary(id).then((s) => ({ id, s })).catch(() => ({ id, s: null }))));
    el.innerHTML = boards.map(({ id, s }) => this.board(id, s)).join("");
  },

  board(id, s) {
    const g = this.games.find((x) => x.id === id);
    if (!g) return "";
    const view = s ? Object.assign(Object.create(Game), { data: s, id }) : null;
    const plays = (s?.plays ?? []).slice(-6).reverse();
    const tl = (t) => view?.topScorer(t.id);
    const color = (t) => colorOf(t.abbr);
    const line = (t) => `<div class="mb-team ${t.winner ? "win" : ""}" style="--c:${color(t)}">
        <img src="${esc(t.logo || LOGO(t.abbr))}" alt="" /><strong>${esc(t.short)}</strong>
        <span class="mb-lines">${(t.lines ?? []).map((x) => `<i>${esc(x)}</i>`).join("")}</span>
        <b>${g.state === "pre" ? "" : esc(t.score)}</b>
      </div>`;
    const status = g.state === "in" ? `<span class="live">EN VIVO</span> ${esc(g.detail)}` : g.state === "post" ? "Final" : `${fmtTime(g.date)}`;
    const top = [g.away, g.home].map((t) => { const p = tl(t); return p ? `<span><b>${esc(nickname(teamByAbbr(t.abbr) ?? { name: t.short }))}:</b> ${esc(p.name)} ${p.pts} pts</span>` : ""; }).join("");
    return `<div class="mboard ${g.state === "in" ? "is-live" : ""}">
      <div class="mb-head"><span>${status}</span><a href="#partido/${esc(id)}">Ficha completa →</a></div>
      ${line(g.away)}${line(g.home)}
      ${top ? `<div class="mb-top">${top}</div>` : ""}
      <div class="mb-plays">${plays.length ? plays.map((p) => `<div class="mb-play"><small>${esc(p.clock?.displayValue ?? "")}</small>${esc(p.text ?? "")}<b>${esc(p.awayScore ?? "")}-${esc(p.homeScore ?? "")}</b></div>`).join("") : `<p class="muted">${g.state === "pre" ? "Todavía no ha empezado." : "Sin jugadas."}</p>`}</div>
    </div>`;
  },
};

// Avisos de "final apretado": a 5 puntos o menos en los 3 últimos minutos (o en la prórroga)
const CloseAlerts = {
  on: (() => { try { return localStorage.getItem("nbahub-close") !== "off"; } catch { return true; } })(),
  warned: new Set(),

  init() {
    setInterval(() => this.check(), 45000);
    setTimeout(() => this.check(), 5000);
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-close-toggle]");
      if (!b) return;
      this.on = !this.on;
      try { localStorage.setItem("nbahub-close", this.on ? "on" : "off"); } catch {}
      this.paintToggles();
      toast(this.on ? "🔥 Te avisaremos de los finales apretados" : "Avisos de finales apretados desactivados");
    });
    this.paintToggles();
  },

  paintToggles() {
    $$("[data-close-toggle]").forEach((b) => {
      b.classList.toggle("on", this.on);
      b.setAttribute("aria-pressed", this.on);
      b.textContent = this.on ? "🔥 Avisos de finales apretados: activados" : "🔕 Avisos de finales apretados: desactivados";
    });
  },

  secs(clock) {
    const str = String(clock ?? "");
    if (!str.includes(":")) return parseFloat(str) || 0;
    const [m, s] = str.split(":");
    return (+m || 0) * 60 + (parseFloat(s) || 0);
  },

  async check() {
    if (!this.on || document.hidden && !("Notification" in window && Notification.permission === "granted")) return;
    let games;
    try { games = await Api.scoreboard(Tonight.day(), Tonight.day(), true); } catch { return; }
    games.filter((g) => g.state === "in").forEach((g) => {
      const diff = Math.abs((+g.away.score || 0) - (+g.home.score || 0));
      const late = g.period > 4 || (g.period === 4 && this.secs(g.clock) <= 180);
      const key = `${g.id}-${g.period > 4 ? "ot" + g.period : "q4"}`;
      if (!late || diff > 5 || this.warned.has(key)) return;
      this.warned.add(key);
      const txt = `${g.away.short} ${g.away.score} - ${g.home.score} ${g.home.short} · ${g.detail}`;
      toast(`<span class="ntag injury">🔥 Final apretado</span><strong>${esc(txt)}</strong>`, `#partido/${g.id}`);
      if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        try { new Notification("🔥 Final apretado · NBA Hub", { body: txt }); } catch {}
      }
    });
  },
};
