// ---------- Buscador global (Ctrl+K o /) ----------
const Search = {
  sel: 0,
  results: [],
  norm: (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),

  init() {
    const dlg = $("#search");
    $("#search-btn").addEventListener("click", () => this.open());
    document.addEventListener("keydown", (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName ?? "");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); this.open(); }
    });
    $("#search-input").addEventListener("input", () => this.run());
    $("#search-input").addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); this.move(1); }
      if (e.key === "ArrowUp") { e.preventDefault(); this.move(-1); }
      if (e.key === "Enter" && this.results[this.sel]) { e.preventDefault(); this.go(this.results[this.sel].href); }
      if (e.key === "Escape") { e.preventDefault(); $("#search").close(); }
    });
    $("#search-results").addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (a) { e.preventDefault(); this.go(a.getAttribute("href")); }
    });
    dlg.addEventListener("click", (e) => e.target === dlg && dlg.close());
  },

  open() {
    const dlg = $("#search");
    if (!dlg.open) dlg.showModal();
    $("#search-input").value = "";
    $("#search-input").focus();
    this.run();
    Players.load().then(() => this.run());
  },

  go(href) {
    $("#search").close();
    location.hash = href;
  },

  move(d) {
    if (!this.results.length) return;
    this.sel = (this.sel + d + this.results.length) % this.results.length;
    this.paint();
  },

  items() {
    const sections = [
      ["Hoy", "#hoy", "Partidos de esta noche en directo"], ["Noticias", "#noticias", "Última hora, lesiones y fichajes"],
      ["Partidos", "#calendario", "Calendario y resultados"], ["Clasificación", "#clasificacion", "Tabla y cuadro de playoffs"],
      ["NBA Cup", "#nbacup", "Torneo de temporada"], ["Campeones", "#campeones", "Todas las Finales"],
      ["Historia", "#historia", "Línea temporal, MVP, Draft y dorsales retirados"], ["Equipos", "#equipos", "Los 30 equipos"],
      ["Jugadores", "#jugadores", "Líderes, comparador y plantillas"], ["Porra y juegos", "#extras", "Porra, Adivina el jugador, trivia y récords"],
    ].map(([name, href, sub]) => ({ type: "Sección", name, sub, href, keys: name }));
    const teams = TEAMS.map((t) => ({ type: "Equipo", name: t.name, sub: `${t.conf} · ${t.div}`, href: `#equipo/${t.abbr}`, img: LOGO(t.abbr), keys: `${t.name} ${t.city} ${t.abbr}` }));
    const players = (Players.data?.players ?? []).map((p) => ({ type: "Jugador", name: p.name, sub: `${p.teamName ?? p.team ?? ""} · ${p.pos ?? ""}`, href: `#jugador/${p.id}`, img: safeUrl(p.photo), round: true, keys: p.name }));
    const legends = LEGENDS.map((l) => ({ type: "Leyenda", name: l.name, sub: l.teams, href: "#jugadores", keys: l.name }));
    return [...sections, ...teams, ...players, ...legends];
  },

  run() {
    const q = this.norm($("#search-input").value.trim());
    const all = this.items();
    if (!q) {
      this.results = all.filter((x) => x.type === "Sección" || (x.type === "Equipo" && Favs.has(x.href.split("/")[1])));
    } else {
      this.results = all
        .map((x) => {
          const k = this.norm(x.keys);
          const score = k.startsWith(q) ? 3 : k.split(/\s+/).some((w) => w.startsWith(q)) ? 2 : k.includes(q) ? 1 : 0;
          return { ...x, score };
        })
        .filter((x) => x.score)
        .sort((a, b) => b.score - a.score || (a.type === "Equipo" ? -1 : 1))
        .slice(0, 12);
    }
    this.sel = 0;
    this.paint();
  },

  paint() {
    $("#search-results").innerHTML = this.results.length
      ? this.results.map((r, i) => `
        <a href="${esc(r.href)}" class="sr ${i === this.sel ? "sel" : ""}" role="option" aria-selected="${i === this.sel}">
          ${r.img ? `<img src="${esc(r.img)}" alt="" class="${r.round ? "round" : ""}" onerror="this.style.visibility='hidden'" />` : `<span class="sr-ico">${r.type === "Sección" ? "→" : "★"}</span>`}
          <span class="sr-text"><strong>${esc(r.name)}</strong><small>${esc(r.sub)}</small></span>
          <span class="sr-type">${r.type}</span>
        </a>`).join("")
      : `<p class="muted sr-empty">Sin resultados. Prueba con un equipo o un jugador.</p>`;
    $(".sr.sel")?.scrollIntoView({ block: "nearest" });
  },
};
