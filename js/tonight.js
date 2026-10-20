// ---------- "Hoy": todos los partidos de la jornada en directo (estilo Flashscore) ----------
const Tonight = {
  timer: null,
  prev: new Map(), // id -> "awayScore-homeScore" para destacar cambios

  // Jornada según la fecha de EE. UU. (de madrugada en España sigue siendo "esta noche")
  day() { return new Date(Date.now() - 5 * 3600e3); },

  open() {
    this.stop();
    this.load(false);
  },
  stop() { clearTimeout(this.timer); this.timer = null; },

  async load(silent) {
    const el = $("#tonight");
    if (!silent) skeleton(el, 6, 76);
    let games = [];
    try {
      games = await Api.scoreboard(this.day(), this.day(), true);
      this.render(games);
    } catch {
      if (!silent) empty(el, "No se pudieron cargar los partidos de hoy. Se reintentará en unos segundos.");
    }
    if ($("#hoy").classList.contains("active")) {
      const live = games.some((g) => g.state === "in");
      this.timer = setTimeout(() => this.load(true), live ? 20000 : 60000);
    }
  },

  render(games) {
    const el = $("#tonight");
    const d = this.day();
    $("#tonight-date").textContent = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    const groups = [
      ["in", "En directo"],
      ["pre", "Por jugar"],
      ["post", "Finalizados"],
    ].map(([st, label]) => [label, favFirst(games.filter((g) => g.state === st)), st]).filter(([, l]) => l.length);
    const counts = { in: 0, pre: 0, post: 0 };
    games.forEach((g) => counts[g.state]++);
    $("#tonight-counts").innerHTML = `
      <span class="tc live ${counts.in ? "on" : ""}"><b>${counts.in}</b> en directo</span>
      <span class="tc"><b>${counts.pre}</b> por jugar</span>
      <span class="tc"><b>${counts.post}</b> finalizados</span>`;
    if (!games.length) return empty(el, "Hoy no hay partidos de la NBA.");

    const maxQ = Math.max(4, ...games.map((g) => Math.max(g.away.lines?.length ?? 0, g.home.lines?.length ?? 0)));
    const row = (g) => {
      const key = `${g.away.score}-${g.home.score}`;
      const before = this.prev.get(g.id);
      this.prev.set(g.id, key);
      const [pa, ph] = (before ?? key).split("-");
      const status = g.state === "pre" ? `<b>${fmtTime(g.date)}</b>` : g.state === "in" ? `<b class="live-txt">${esc(g.detail)}</b>` : `<b>Final</b>`;
      const team = (t, oldScore) => {
        const changed = g.state === "in" && before && String(oldScore) !== String(t.score);
        return `<div class="tr-team ${t.winner ? "win" : ""}">
          <span class="tr-star">${Favs.has(t.abbr) ? "★" : ""}</span>
          <img src="${esc(t.logo || LOGO(t.abbr))}" alt="" loading="lazy" />
          <span class="tr-name">${esc(t.short)}</span>
          <span class="tr-lines">${Array.from({ length: maxQ }, (_, i) => `<i>${esc(t.lines?.[i] ?? "")}</i>`).join("")}</span>
          <span class="tr-score ${changed ? "flash" : ""}">${g.state === "pre" ? "" : esc(t.score)}</span>
        </div>`;
      };
      return `<a class="tr ${g.state === "in" ? "is-live" : ""}" href="#partido/${esc(g.id)}">
        <div class="tr-status">${status}<small>${esc(g.tv || "")}</small></div>
        <div class="tr-teams">${team(g.away, pa)}${team(g.home, ph)}</div>
        <span class="tr-go" aria-hidden="true">›</span>
      </a>`;
    };
    el.innerHTML = groups.map(([label, list, st]) => `
      <div class="tg">
        <h3 class="tg-title ${st === "in" ? "live" : ""}">${label}<span>${list.length}</span></h3>
        <div class="tg-head"><span></span><span class="tr-lines">${Array.from({ length: maxQ }, (_, i) => `<i>${i < 4 ? i + 1 + "º" : "PR"}</i>`).join("")}</span><span>Total</span></div>
        ${list.map(row).join("")}
      </div>`).join("") +
      `<p class="muted note tv-note">📺 ${esc(TV_SPAIN.note)}</p>`;
  },
};
