// ---------- Porra diaria: elige ganadores y lleva tu racha ----------
const Porra = {
  picks: (() => { try { return JSON.parse(localStorage.getItem("nbahub-porra") || "{}"); } catch { return {}; } })(),
  games: [],
  results: new Map(), // eventId -> partido terminado (para puntuar)

  save() { try { localStorage.setItem("nbahub-porra", JSON.stringify(this.picks)); } catch {} },

  async open() {
    const el = $("#porra");
    if (!this.games.length) skeleton(el, 3, 110);
    try {
      // La jornada: el primer día (hora de EE. UU.) con partidos desde hoy
      const now = new Date();
      const all = await Api.scoreboard(new Date(+now - 86400000), new Date(+now + 4 * 86400000), true);
      const etDay = (d) => new Date(+d - 5 * 3600e3).toISOString().slice(0, 10);
      const pending = all.filter((g) => g.state !== "post");
      const day = pending.length ? etDay(pending[0].date) : etDay(all.at(-1)?.date ?? now);
      this.games = all.filter((g) => etDay(g.date) === day);
      await this.score(all);
      this.render(day);
    } catch {
      empty(el, "No se pudo cargar la jornada. Inténtalo de nuevo en un momento.");
    }
  },

  // Busca el resultado de los partidos en los que has apostado
  async score(known) {
    known.filter((g) => g.state === "post").forEach((g) => this.results.set(g.id, g));
    const missing = Object.entries(this.picks).filter(([id, p]) => !this.results.has(id) && Date.now() - p.t < 30 * 86400000);
    if (!missing.length) return;
    const first = new Date(Math.min(...missing.map(([, p]) => p.date || p.t)));
    try {
      const games = await Api.scoreboard(first, new Date());
      games.filter((g) => g.state === "post").forEach((g) => this.results.set(g.id, g));
    } catch {}
  },

  stats() {
    const done = Object.entries(this.picks)
      .map(([id, p]) => ({ id, ...p, g: this.results.get(id) }))
      .filter((x) => x.g)
      .sort((a, b) => (a.date || a.t) - (b.date || b.t));
    let streak = 0, best = 0, run = 0;
    done.forEach((x) => {
      x.ok = (x.g.home.winner ? x.g.home.abbr : x.g.away.abbr) === x.pick;
      run = x.ok ? run + 1 : 0;
      best = Math.max(best, run);
    });
    for (let i = done.length - 1; i >= 0 && done[i].ok; i--) streak++;
    const hits = done.filter((x) => x.ok).length;
    return { done, hits, total: done.length, pct: done.length ? Math.round((hits / done.length) * 100) : 0, streak, best };
  },

  render(day) {
    const el = $("#porra");
    const st = this.stats();
    const dateTxt = new Date(day + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    const row = (g) => {
      const pick = this.picks[g.id]?.pick;
      const locked = g.state !== "pre";
      const winner = g.state === "post" ? (g.home.winner ? g.home.abbr : g.away.abbr) : null;
      const btn = (t) => {
        const cls = [pick === t.abbr && "picked", winner && winner === t.abbr && "won", winner && pick === t.abbr && winner !== t.abbr && "lost"].filter(Boolean).join(" ");
        return `<button class="pick ${cls}" data-game="${esc(g.id)}" data-team="${esc(t.abbr)}" ${locked ? "disabled" : ""} style="--c:${colorOf(t.abbr)}" aria-pressed="${pick === t.abbr}">
          <img src="${esc(t.logo || LOGO(t.abbr))}" alt="" /><strong>${esc(t.short)}</strong>
          ${g.state !== "pre" ? `<b>${esc(t.score)}</b>` : `<small>${esc(t.record)}</small>`}
        </button>`;
      };
      const status = g.state === "pre" ? fmtTime(g.date) : g.state === "in" ? `<span class="live">EN VIVO</span>` : "Final";
      const verdict = winner && pick ? (winner === pick ? `<span class="verdict ok">✓ Acierto</span>` : `<span class="verdict ko">✗ Fallo</span>`) : locked && !pick ? `<span class="verdict">Sin elegir</span>` : "";
      return `<div class="porra-row">${btn(g.away)}<div class="porra-mid"><span>${status}</span>${verdict}</div>${btn(g.home)}</div>`;
    };
    const pickedToday = this.games.filter((g) => this.picks[g.id]).length;
    el.innerHTML = `
      <div class="porra-stats">
        <div><b>${st.hits}/${st.total}</b><span>Aciertos</span></div>
        <div><b>${st.pct}%</b><span>Porcentaje</span></div>
        <div><b>${st.streak}${st.streak >= 3 ? " 🔥" : ""}</b><span>Racha actual</span></div>
        <div><b>${st.best}</b><span>Mejor racha</span></div>
      </div>
      <div class="card-block">
        <div class="porra-head">
          <h3>Jornada del ${esc(dateTxt)}</h3>
          <span class="muted">${pickedToday}/${this.games.length} elegidos · se cierra cada partido al empezar</span>
        </div>
        ${this.games.length ? this.games.map(row).join("") : `<p class="muted">No hay partidos en los próximos días.</p>`}
        <div class="porra-actions">
          <button class="btn primary" id="porra-share">Compartir mi porra</button>
          ${Object.keys(this.picks).length ? `<button class="btn" id="porra-reset">Borrar historial</button>` : ""}
        </div>
      </div>
      ${st.done.length ? `<div class="card-block porra-history"><h3>Historial</h3>${st.done.slice(-15).reverse().map((x) => `
        <a class="ph-row" href="#partido/${esc(x.id)}"><span class="${x.ok ? "ok" : "ko"}">${x.ok ? "✓" : "✗"}</span>
          ${esc(x.g.away.short)} ${esc(x.g.away.score)}-${esc(x.g.home.score)} ${esc(x.g.home.short)}
          <small>Elegiste ${esc(nickname(teamByAbbr(x.pick) ?? { name: x.pick }))}</small></a>`).join("")}</div>` : ""}`;

    $$(".pick", el).forEach((b) => b.addEventListener("click", () => {
      const g = this.games.find((x) => x.id === b.dataset.game);
      if (!g || g.state !== "pre") return;
      this.picks[g.id] = { pick: b.dataset.team, t: Date.now(), date: +g.date };
      this.save();
      this.render(day);
    }));
    $("#porra-share").addEventListener("click", () => this.share(st));
    $("#porra-reset")?.addEventListener("click", () => {
      if (!confirm("¿Borrar todas tus elecciones y tu historial de la porra?")) return;
      this.picks = {};
      this.save();
      this.render(day);
    });
  },

  async share(st) {
    const today = this.games.filter((g) => this.picks[g.id]).map((g) => `${g.away.abbr.toUpperCase()}@${g.home.abbr.toUpperCase()}: ${this.picks[g.id].pick.toUpperCase()}`);
    const text = `🏀 Mi porra NBA Hub · ${st.hits}/${st.total} aciertos (${st.pct}%)${st.streak ? ` · racha de ${st.streak}` : ""}${today.length ? `\nHoy: ${today.join(", ")}` : ""}`;
    const url = "https://ikerrmansso69.github.io/nba-hub/#extras";
    try {
      if (navigator.share) await navigator.share({ title: "Mi porra NBA Hub", text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); toast("Copiado al portapapeles. ¡Pégalo donde quieras!"); }
    } catch {}
  },
};
