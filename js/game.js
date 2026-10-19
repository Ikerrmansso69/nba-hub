// ---------- Ficha de partido en directo (estilo Flashscore) ----------
const STAT_ES = {
  "fieldGoalsMade-fieldGoalsAttempted": "Tiros de campo",
  fieldGoalPct: "% Tiros de campo",
  "threePointFieldGoalsMade-threePointFieldGoalsAttempted": "Triples",
  threePointFieldGoalPct: "% Triples",
  "freeThrowsMade-freeThrowsAttempted": "Tiros libres",
  freeThrowPct: "% Tiros libres",
  totalRebounds: "Rebotes",
  offensiveRebounds: "Rebotes ofensivos",
  defensiveRebounds: "Rebotes defensivos",
  assists: "Asistencias",
  steals: "Robos",
  blocks: "Tapones",
  turnovers: "Pérdidas",
  totalTurnovers: "Pérdidas totales",
  teamTurnovers: "Pérdidas de equipo",
  turnoverPoints: "Puntos tras pérdida",
  fastBreakPoints: "Puntos al contraataque",
  pointsInPaint: "Puntos en la pintura",
  fouls: "Faltas",
  technicalFouls: "Técnicas",
  totalTechnicalFouls: "Técnicas",
  flagrantFouls: "Flagrantes",
  largestLead: "Máxima ventaja",
  leadChanges: "Cambios de líder",
  leadPercentage: "% de tiempo por delante",
};
const POS_RANK = { PG: 0, G: 1, SG: 1, GF: 2, SF: 2, F: 3, PF: 3, FC: 4, C: 4 };
// Huecos del quinteto en media pista (porcentaje sobre la pista completa, lado izquierdo)
// Huecos del quinteto en media pista (porcentaje sobre la media pista, canasta a la izquierda)
const SLOTS = [[76, 50], [60, 17], [60, 83], [33, 28], [22, 68]];

const Game = {
  id: null,
  data: null,
  tab: "resumen",
  timer: null,
  probable: {},
  pbpPeriod: "all",
  pbpScoring: false,
  shotTeam: "both",
  shotPlayer: "all",

  open(id) {
    if (this.id !== id) {
      this.stop();
      Object.assign(this, { id, data: null, tab: "resumen", probable: {}, pbpPeriod: "all", pbpScoring: false, shotTeam: "both", shotPlayer: "all" });
      $("#match").innerHTML = `<div class="skel" style="height:220px"></div><div class="skel" style="height:48px;margin-top:16px"></div><div class="skel" style="height:420px;margin-top:16px"></div>`;
    }
    this.load();
  },

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  },

  async load() {
    const id = this.id;
    try {
      const data = await Api.summary(id);
      if (id !== this.id) return;
      this.data = data;
      this.render();
      if (this.state() === "in") this.timer = setTimeout(() => this.load(), 15000);
      else if (this.state() === "pre") this.timer = setTimeout(() => this.load(), 60000);
    } catch {
      if (!this.data) $("#match").innerHTML = `<p class="muted">No se pudo cargar el partido. Reintentando…</p>`;
      this.timer = setTimeout(() => this.load(), 20000);
    }
  },

  comp() { return this.data?.header?.competitions?.[0] ?? {}; },
  state() { return this.comp().status?.type?.state ?? "pre"; },
  side(ha) {
    const c = this.comp().competitors?.find((x) => x.homeAway === ha) ?? {};
    const t = c.team ?? {};
    const abbr = (t.abbreviation ?? "").toLowerCase();
    return {
      id: String(t.id ?? ""), abbr, name: t.displayName ?? "", short: t.shortDisplayName ?? t.name ?? t.displayName ?? "",
      logo: safeUrl(t.logos?.[0]?.href ?? t.logo) || LOGO(abbr),
      color: this.teamColor(ha, abbr, t),
      score: c.score ?? "", winner: c.winner, record: c.record?.[0]?.summary ?? c.records?.[0]?.summary ?? "",
      lines: (c.linescores ?? []).map((l) => l.displayValue ?? l.value ?? ""),
    };
  },

  // Si los dos equipos comparten color (p. ej. 76ers y Knicks), el local usa su color secundario
  teamColor(ha, abbr, t) {
    const base = (a, raw) => teamByAbbr(a)?.color ?? (raw?.color ? "#" + raw.color : "#3a4258");
    const own = base(abbr, t);
    if (ha === "away") return own;
    const other = this.comp().competitors?.find((x) => x.homeAway === "away")?.team ?? {};
    const awayColor = base((other.abbreviation ?? "").toLowerCase(), other);
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const dist = Math.hypot(...rgb(own).map((v, i) => v - rgb(awayColor)[i]));
    return dist < 90 ? teamByAbbr(abbr)?.alt ?? (t.alternateColor ? "#" + t.alternateColor : "#ff6b1a") : own;
  },

  render() {
    const away = this.side("away"), home = this.side("home");
    const st = this.comp().status ?? {};
    const state = this.state();
    const tabs = this.tabs();
    if (!tabs.some((t) => t[0] === this.tab)) this.tab = "resumen";
    const date = this.comp().date ? new Date(this.comp().date) : null;
    const statusTxt =
      state === "in" ? `<span class="live">EN VIVO</span> ${esc(st.type?.shortDetail ?? "")}`
      : state === "post" ? esc(st.type?.detail === "Final" ? "Final" : st.type?.shortDetail ?? "Final")
      : date ? `${fmtDate(date)} · ${fmtTime(date)}` : "Próximamente";
    const periods = Math.max(away.lines.length, home.lines.length);
    const qLabel = (i) => (i < 4 ? `${i + 1}º` : `PR${i > 4 ? i - 3 : ""}`);

    $("#match").innerHTML = `
      <div class="m-head" style="--ca:${away.color};--ch:${home.color}">
        <div class="m-team">
          <img src="${esc(away.logo)}" alt="" />
          <strong><span class="full">${esc(away.name)}</span><span class="nick">${esc(away.short)}</span></strong><small>${esc(away.record)} · Visitante</small>
        </div>
        <div class="m-center">
          <div class="m-status">${statusTxt}</div>
          <div class="m-score">${state === "pre" ? `<span class="vs">VS</span>` : `<b class="${away.winner ? "w" : ""}">${esc(away.score)}</b><i>-</i><b class="${home.winner ? "w" : ""}">${esc(home.score)}</b>`}</div>
          ${state === "in" ? `<div class="m-refresh"><span class="pulse"></span>Actualización automática · ${new Date().toLocaleTimeString("es-ES")}</div>` : ""}
        </div>
        <div class="m-team">
          <img src="${esc(home.logo)}" alt="" />
          <strong><span class="full">${esc(home.name)}</span><span class="nick">${esc(home.short)}</span></strong><small>${esc(home.record)} · Local</small>
        </div>
      </div>
      ${periods ? `
      <div class="table-wrap m-lines">
        <table class="table compact">
          <thead><tr><th>Equipo</th>${Array.from({ length: periods }, (_, i) => `<th>${qLabel(i)}</th>`).join("")}<th>Total</th></tr></thead>
          <tbody>${[away, home].map((t) => `<tr><td><span class="team-cell"><img src="${esc(t.logo)}" alt="" />${esc(t.short)}</span></td>${Array.from({ length: periods }, (_, i) => `<td class="num">${esc(t.lines[i] ?? "")}</td>`).join("")}<td class="num"><strong>${esc(t.score)}</strong></td></tr>`).join("")}</tbody>
        </table>
      </div>` : ""}
      <div class="m-tabs" role="tablist">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === this.tab ? "active" : ""}">${l}</button>`).join("")}</div>
      <div id="m-pane"></div>`;

    $(".m-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      this.tab = b.dataset.tab;
      $$(".m-tabs button").forEach((x) => x.classList.toggle("active", x === b));
      this.renderPane();
    });
    this.renderPane();
  },

  tabs() {
    const d = this.data;
    const hasBox = d.boxscore?.players?.some((p) => p.statistics?.[0]?.athletes?.length);
    const hasStats = this.state() !== "pre" && d.boxscore?.teams?.some((t) => t.statistics?.length);
    const hasPlays = d.plays?.length;
    return [
      ["resumen", "Resumen"],
      hasStats && ["stats", "Estadísticas"],
      ["lineups", "Alineaciones"],
      hasBox && ["box", "Jugadores"],
      hasPlays && ["pbp", "Jugada a jugada"],
      hasPlays && ["shots", "Mapa de tiro"],
      d.videos?.length && ["videos", "Vídeos"],
      ["injuries", "Bajas"],
    ].filter(Boolean);
  },

  renderPane() {
    const el = $("#m-pane");
    const fn = { videos: this.paneVideos, resumen: this.paneSummary, stats: this.paneStats, lineups: this.paneLineups, box: this.paneBox, pbp: this.panePbp, shots: this.paneShots, injuries: this.paneInjuries }[this.tab];
    el.innerHTML = "";
    fn.call(this, el);
  },

  // ----- Resumen -----
  paneSummary(el) {
    const d = this.data;
    const away = this.side("away"), home = this.side("home");
    const parts = [];

    // Probabilidad de victoria
    const wp = d.winprobability ?? [];
    if (wp.length > 1) {
      const W = 600, H = 160;
      const pts = wp.map((p, i) => `${((i / (wp.length - 1)) * W).toFixed(1)},${(H - (p.homeWinPercentage ?? 0.5) * H).toFixed(1)}`).join(" ");
      const last = (wp.at(-1).homeWinPercentage ?? 0.5) * 100;
      parts.push(`
        <div class="card-block">
          <h3>Probabilidad de victoria</h3>
          <div class="wp-legend"><span style="--c:${home.color}">${esc(home.short)} ${last.toFixed(0)}%</span><span style="--c:${away.color}">${esc(away.short)} ${(100 - last).toFixed(0)}%</span></div>
          <svg class="wp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
            <defs><linearGradient id="wpg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${home.color}"/><stop offset=".5" stop-color="${home.color}" stop-opacity=".05"/><stop offset=".5" stop-color="${away.color}" stop-opacity=".05"/><stop offset="1" stop-color="${away.color}"/></linearGradient></defs>
            <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" class="wp-mid"/>
            <polygon points="0,${H / 2} ${pts} ${W},${H / 2}" fill="url(#wpg)" opacity=".5"/>
            <polyline points="${pts}" class="wp-line"/>
          </svg>
          <div class="wp-axis"><span>${esc(home.short)} 100%</span><span>50%</span><span>${esc(away.short)} 100%</span></div>
        </div>`);
    } else if (d.predictor) {
      const h = +(d.predictor.homeTeam?.gameProjection ?? 50), a = +(d.predictor.awayTeam?.gameProjection ?? 100 - h);
      parts.push(`
        <div class="card-block">
          <h3>Pronóstico ESPN</h3>
          <div class="predict">
            <div><img src="${esc(away.logo)}" alt="" /><b>${a.toFixed(1)}%</b></div>
            <div class="predict-bar"><span style="width:${a}%;background:${away.color}"></span><span style="width:${h}%;background:${home.color}"></span></div>
            <div><b>${h.toFixed(1)}%</b><img src="${esc(home.logo)}" alt="" /></div>
          </div>
        </div>`);
    }

    // Previa: últimos 5 partidos de cada equipo
    const l5 = d.lastFiveGames ?? [];
    if (l5.some((t) => t.events?.length)) {
      const teamRow = (t) => {
        const side = this.sideById(String(t.team?.id));
        const evs = (t.events ?? []).slice(0, 5);
        const wins = evs.filter((e) => e.gameResult === "W").length;
        return `<div class="l5-team">
          <h4><img src="${esc(side.logo)}" alt="" />${esc(side.short)}<span>${wins}-${evs.length - wins}</span></h4>
          <div class="l5-games">${evs.map((e) => `
            <a class="l5 ${e.gameResult === "W" ? "w" : e.gameResult === "L" ? "l" : ""}" href="#partido/${esc(e.id)}" title="${esc(new Date(e.gameDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" }))}">
              <b>${e.gameResult === "W" ? "V" : e.gameResult === "L" ? "D" : "–"}</b>
              <img src="${esc(safeUrl(e.opponentLogo) || LOGO((e.opponent?.abbreviation ?? "").toLowerCase()))}" alt="" />
              <small>${esc(e.atVs ?? "")} ${esc(e.opponent?.abbreviation ?? "")}</small>
              <span>${esc(e.score ?? "")}</span>
            </a>`).join("")}</div>
        </div>`;
      };
      parts.push(`<div class="card-block"><h3>Últimos 5 partidos</h3>${l5.map(teamRow).join("")}</div>`);
    }

    // Enfrentamientos de la temporada
    const ser = (d.seasonseries ?? []).find((x) => x.type === "season") ?? d.seasonseries?.[0];
    if (ser?.events?.length) {
      const evRow = (e) => {
        const c = (ha) => e.competitors?.find((x) => x.homeAway === ha) ?? {};
        const a = c("away"), h = c("home");
        const done = e.statusType?.completed;
        const date = new Date(e.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
        const logo = (x) => esc(safeUrl(x.team?.logo) || LOGO((x.team?.abbreviation ?? "").toLowerCase()));
        return `<a class="series-row ${String(e.id) === String(this.id) ? "current" : ""}" href="#partido/${esc(e.id)}">
          <small>${date}</small>
          <span><img src="${logo(a)}" alt="" />${esc(a.team?.abbreviation ?? "")}</span>
          <b>${done ? `${esc(a.score)} - ${esc(h.score)}` : String(e.id) === String(this.id) ? "Este partido" : "Pendiente"}</b>
          <span>${esc(h.team?.abbreviation ?? "")}<img src="${logo(h)}" alt="" /></span>
        </a>`;
      };
      const score = (ser.seriesScore ?? "").replace(/-/, " - ");
      parts.push(`<div class="card-block"><h3>Enfrentamientos de la temporada</h3>
        <p class="series-score">${ser.completed ? "Serie terminada" : "Serie"} · <b>${esc(score || "0 - 0")}</b> · ${esc(ser.totalCompetitions ?? ser.events.length)} partidos</p>
        ${ser.events.map(evRow).join("")}</div>`);
    }

    // Líderes
    const leaders = d.leaders ?? [];
    if (leaders.some((l) => l.leaders?.length)) {
      const cat = { points: "Puntos", rebounds: "Rebotes", assists: "Asistencias" };
      const teamBlock = (L) => {
        const t = this.sideById(String(L.team?.id));
        return `<div class="leaders-team"><h4><img src="${esc(t.logo)}" alt="" />${esc(t.short)}</h4>${(L.leaders ?? [])
          .filter((c) => cat[c.name])
          .map((c) => {
            const p = c.leaders?.[0];
            if (!p) return "";
            return `<div class="leader"><img src="${esc(safeUrl(p.athlete?.headshot?.href) || PLACEHOLDER)}" alt="" onerror="this.src=PLACEHOLDER" />
              <div><small>${cat[c.name]}</small><strong>${esc(p.athlete?.displayName ?? "")}</strong><span>${esc(p.displayValue ?? "")}</span></div></div>`;
          }).join("")}</div>`;
      };
      parts.push(`<div class="card-block"><h3>${this.state() === "pre" ? "Líderes de la temporada" : "Líderes del partido"}</h3><div class="leaders">${leaders.map(teamBlock).join("")}</div></div>`);
    }

    // Últimas canastas
    const scoring = (d.plays ?? []).filter((p) => p.scoringPlay).slice(-8).reverse();
    if (scoring.length) parts.push(`<div class="card-block"><h3>Últimas canastas</h3>${scoring.map((p) => this.playRow(p)).join("")}</div>`);

    // Información
    const gi = d.gameInfo ?? {};
    const info = [
      gi.venue?.fullName && ["Pabellón", [gi.venue.fullName, gi.venue.address?.city].filter(Boolean).join(", ")],
      gi.attendance && ["Asistencia", Number(gi.attendance).toLocaleString("es-ES") + " espectadores"],
      gi.officials?.length && ["Árbitros", gi.officials.map((o) => o.displayName ?? o.fullName).join(", ")],
      this.comp().broadcasts?.length && ["TV", this.comp().broadcasts.map((b) => b.media?.shortName ?? b.names?.join(", ")).filter(Boolean).join(", ")],
    ].filter(Boolean);
    const venueImg = safeUrl(gi.venue?.images?.[0]?.href);
    if (info.length) parts.push(`<div class="card-block">${venueImg ? `<img class="venue-img" src="${esc(venueImg)}" alt="${esc(gi.venue?.fullName ?? "")}" loading="lazy" onerror="this.remove()" />` : ""}<h3>Información</h3><dl class="info">${info.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`);

    el.innerHTML = `<div class="m-grid">${parts.join("") || `<p class="muted">Todavía no hay datos de este partido.</p>`}</div>`;
  },

  sideById(id) {
    const a = this.side("away");
    return a.id === id ? a : this.side("home");
  },

  // ----- Vídeos -----
  paneVideos(el) {
    el.innerHTML = `<div class="videos-grid">${(this.data.videos ?? []).map((v) => Videos.card(v)).join("")}</div>`;
  },

  // ----- Estadísticas de equipo -----
  paneStats(el) {
    const teams = this.data.boxscore?.teams ?? [];
    const away = this.side("away"), home = this.side("home");
    const find = (t) => teams.find((x) => String(x.team?.id) === t.id) ?? teams[t === away ? 0 : 1];
    const A = find(away)?.statistics ?? [], H = find(home)?.statistics ?? [];
    const rows = A.map((s) => {
      const h = H.find((x) => x.name === s.name);
      if (!h) return "";
      const label = STAT_ES[s.name] ?? s.label ?? s.name;
      const av = s.displayValue ?? "", hv = h.displayValue ?? "";
      const an = parseFloat(av), hn = parseFloat(hv);
      const isNum = /^-?[\d.]+$/.test(av) && /^-?[\d.]+$/.test(hv);
      const total = an + hn || 1;
      return `<div class="stat-row">
        <div class="stat-vals"><b class="${isNum && an > hn ? "hi" : ""}">${esc(av)}</b><span>${esc(label)}</span><b class="${isNum && hn > an ? "hi" : ""}">${esc(hv)}</b></div>
        ${isNum ? `<div class="stat-bars"><div><span style="width:${(an / total) * 100}%;background:${away.color}"></span></div><div><span style="width:${(hn / total) * 100}%;background:${home.color}"></span></div></div>` : ""}
      </div>`;
    }).join("");
    el.innerHTML = `<div class="card-block stats-card">
      <div class="stats-head"><span><img src="${esc(away.logo)}" alt="" />${esc(away.short)}</span><span>${esc(home.short)}<img src="${esc(home.logo)}" alt="" /></span></div>
      ${rows}</div>`;
  },

  // ----- Box score -----
  paneBox(el) {
    const groups = this.data.boxscore?.players ?? [];
    el.innerHTML = groups.map((g) => {
      const t = this.sideById(String(g.team?.id));
      const s = g.statistics?.[0] ?? {};
      const cols = s.names ?? s.labels ?? [];
      const athletes = s.athletes ?? [];
      const row = (a) => `<tr class="${a.starter ? "starter" : ""}">
        <td class="sticky"><span class="pl"><img src="${esc(safeUrl(a.athlete?.headshot?.href) || PLACEHOLDER)}" alt="" loading="lazy" onerror="this.src=PLACEHOLDER" />
          <span><a href="#jugador/${esc(a.athlete?.id ?? "")}"><strong>${esc(a.athlete?.shortName ?? a.athlete?.displayName ?? "")}</strong></a><small>${esc(a.athlete?.position?.abbreviation ?? "")} ${a.athlete?.jersey ? "#" + esc(a.athlete.jersey) : ""}</small></span></span></td>
        ${a.didNotPlay || !a.stats?.length ? `<td colspan="${cols.length}" class="muted">${esc(a.reason || "No jugó")}</td>` : a.stats.map((v) => `<td class="num">${esc(v)}</td>`).join("")}
      </tr>`;
      const starters = athletes.filter((a) => a.starter), bench = athletes.filter((a) => !a.starter);
      return `<div class="card-block box" style="--c:${t.color}">
        <h3><img src="${esc(t.logo)}" alt="" />${esc(t.name)}</h3>
        <div class="table-wrap"><table class="table compact box-table">
          <thead><tr><th class="sticky">Titulares</th>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>${starters.map(row).join("")}
            <tr class="sep"><td class="sticky">Banquillo</td><td colspan="${cols.length}"></td></tr>
            ${bench.map(row).join("")}</tbody>
        </table></div></div>`;
    }).join("");
  },

  // ----- Jugada a jugada -----
  playRow(p) {
    const t = p.team?.id ? this.sideById(String(p.team.id)) : null;
    return `<div class="play ${p.scoringPlay ? "scoring" : ""}" style="--c:${t?.color ?? "transparent"}">
      <span class="play-clock">${esc(p.period?.number ? (p.period.number <= 4 ? p.period.number + "º" : "PR") : "")} ${esc(p.clock?.displayValue ?? "")}</span>
      ${t ? `<img src="${esc(t.logo)}" alt="" />` : `<span class="play-noimg"></span>`}
      <span class="play-text">${esc(p.text ?? "")}</span>
      <span class="play-score">${esc(p.awayScore ?? "")}-${esc(p.homeScore ?? "")}</span>
    </div>`;
  },

  panePbp(el) {
    const plays = this.data.plays ?? [];
    const periods = [...new Set(plays.map((p) => p.period?.number).filter(Boolean))];
    const list = plays.filter((p) => (this.pbpPeriod === "all" || String(p.period?.number) === this.pbpPeriod) && (!this.pbpScoring || p.scoringPlay)).slice().reverse();
    el.innerHTML = `<div class="card-block">
      <div class="pbp-tools">
        <div class="seg small">${[["all", "Todo"], ...periods.map((n) => [String(n), n <= 4 ? `${n}º cuarto` : `Prórroga ${n - 4}`])].map(([v, l]) => `<button data-p="${v}" class="${this.pbpPeriod === v ? "active" : ""}">${l}</button>`).join("")}</div>
        <label class="check"><input type="checkbox" id="pbp-scoring" ${this.pbpScoring ? "checked" : ""} /> Solo canastas</label>
      </div>
      <div class="pbp">${list.slice(0, 400).map((p) => this.playRow(p)).join("") || `<p class="muted">Sin jugadas.</p>`}</div>
    </div>`;
    $(".pbp-tools .seg", el).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { this.pbpPeriod = b.dataset.p; this.renderPane(); }
    });
    $("#pbp-scoring").addEventListener("change", (e) => { this.pbpScoring = e.target.checked; this.renderPane(); });
  },

  // ----- Mapa de tiro -----
  shots() {
    return (this.data.plays ?? []).filter((p) => {
      const c = p.coordinate;
      return p.shootingPlay && c && c.x >= 0 && c.x <= 50 && c.y >= 0 && c.y <= 94 && !/free throw/i.test(`${p.type?.text} ${p.text}`);
    });
  },

  paneShots(el) {
    const away = this.side("away"), home = this.side("home");
    const all = this.shots();
    const players = new Map();
    all.forEach((p) => {
      const id = p.participants?.[0]?.athlete?.id;
      if (id && !players.has(id)) {
        const name = (p.text ?? "").split(/ makes| misses| blocks/)[0];
        players.set(id, { name, team: String(p.team?.id) });
      }
    });
    const shots = all.filter((p) =>
      (this.shotTeam === "both" || String(p.team?.id) === this.shotTeam) &&
      (this.shotPlayer === "all" || p.participants?.[0]?.athlete?.id === this.shotPlayer));
    const dot = (p) => {
      const isAway = String(p.team?.id) === away.id;
      let { x, y } = p.coordinate;
      if (y > 47) y = 94 - y;
      const cx = isAway ? y * 10 + 52 : 940 - (y * 10 + 52);
      const cy = isAway ? x * 10 : 500 - x * 10;
      const color = isAway ? away.color : home.color;
      const made = p.scoringPlay;
      const tip = `${p.period?.number <= 4 ? p.period.number + "º" : "PR"} ${p.clock?.displayValue ?? ""} · ${p.text ?? ""}`;
      return made
        ? `<circle cx="${cx}" cy="${cy}" r="9" fill="${color}" stroke="#fff" stroke-width="2"><title>${esc(tip)}</title></circle>`
        : `<g class="miss" stroke="${color}"><title>${esc(tip)}</title><line x1="${cx - 7}" y1="${cy - 7}" x2="${cx + 7}" y2="${cy + 7}"/><line x1="${cx - 7}" y1="${cy + 7}" x2="${cx + 7}" y2="${cy - 7}"/></g>`;
    };
    const pct = (team) => {
      const s = shots.filter((p) => String(p.team?.id) === team.id);
      const m = s.filter((p) => p.scoringPlay).length;
      return `<div class="shot-stat" style="--c:${team.color}"><img src="${esc(team.logo)}" alt="" /><b>${m}/${s.length}</b><span>${s.length ? Math.round((m / s.length) * 100) : 0}% en juego</span></div>`;
    };
    el.innerHTML = `<div class="card-block">
      <div class="pbp-tools">
        <div class="seg small" id="shot-team">${[["both", "Ambos"], [away.id, away.short], [home.id, home.short]].map(([v, l]) => `<button data-v="${esc(v)}" class="${this.shotTeam === v ? "active" : ""}">${esc(l)}</button>`).join("")}</div>
        <select id="shot-player"><option value="all">Todos los jugadores</option>${[...players].filter(([, p]) => this.shotTeam === "both" || p.team === this.shotTeam).map(([id, p]) => `<option value="${esc(id)}" ${this.shotPlayer === id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      </div>
      <div class="court-wrap">${courtSvg(shots.map(dot).join(""))}</div>
      <div class="shot-legend"><span><i class="lg-made"></i>Anotado</span><span><i class="lg-miss">✕</i>Fallado</span><span class="muted">Visitante a la izquierda · Local a la derecha</span></div>
      <div class="shot-stats">${pct(away)}${pct(home)}</div>
    </div>`;
    $("#shot-team").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { this.shotTeam = b.dataset.v; this.shotPlayer = "all"; this.renderPane(); }
    });
    $("#shot-player").addEventListener("change", (e) => { this.shotPlayer = e.target.value; this.renderPane(); });
  },

  // ----- Alineaciones -----
  async paneLineups(el) {
    const away = this.side("away"), home = this.side("home");
    const box = this.data.boxscore?.players ?? [];
    const fromBox = (t) => {
      const g = box.find((x) => String(x.team?.id) === t.id);
      const ath = g?.statistics?.[0]?.athletes ?? [];
      return {
        starters: ath.filter((a) => a.starter).map((a) => this.lineupPlayer(a.athlete)),
        bench: ath.filter((a) => !a.starter).map((a) => this.lineupPlayer(a.athlete)),
      };
    };
    let A = fromBox(away), H = fromBox(home);
    let probable = false;
    if (A.starters.length < 5 || H.starters.length < 5) {
      probable = true;
      el.innerHTML = `<div class="skel" style="height:420px"></div>`;
      [A, H] = await Promise.all([this.probableLineup(away), this.probableLineup(home)]);
      if (this.tab !== "lineups") return;
    }
    const out = this.injuredNames();
    const chip = (p, i, isHome) => {
      const [x, y] = SLOTS[i] ?? [25, 50];
      const injured = out.get(p.name);
      return `<div class="lp ${injured ? "hurt" : ""}" style="left:${isHome ? 100 - x : x}%;top:${y}%;--c:${isHome ? home.color : away.color}">
        <div class="lp-photo"><img src="${esc(p.photo || PLACEHOLDER)}" alt="" onerror="this.src=PLACEHOLDER" /><span>${esc(p.jersey)}</span></div>
        <strong>${esc(p.short)}</strong><small>${esc(p.pos)}${injured ? ` · ${esc(injured)}` : ""}</small>
      </div>`;
    };
    const order = (list) => list.slice(0, 5).sort((a, b) => (POS_RANK[a.pos] ?? 2) - (POS_RANK[b.pos] ?? 2));
    const benchList = (t, list) => list.length ? `<div class="bench" style="--c:${t.color}"><h4><img src="${esc(t.logo)}" alt="" />Banquillo · ${esc(t.short)}</h4>${list.map((p) => `<span>${p.jersey ? `<b>${esc(p.jersey)}</b>` : ""}${esc(p.name)} <small>${esc(p.pos)}</small></span>`).join("")}</div>` : "";
    el.innerHTML = `<div class="card-block">
      <h3>${probable ? "Quintetos probables" : "Quintetos iniciales"}</h3>
      ${probable ? `<p class="muted note">Estimación: titulares del último partido de cada equipo. Los jugadores en el parte de lesiones aparecen marcados en rojo.</p>` : ""}
      <div class="lineup-court">
        <div class="half">
          ${courtSvg("", "0 0 470 500")}
          <div class="lp-team left"><img src="${esc(away.logo)}" alt="" />${esc(away.short)}</div>
          ${order(A.starters).map((p, i) => chip(p, i, false)).join("") || `<p class="lp-empty">Quinteto no disponible</p>`}
        </div>
        <div class="half">
          ${courtSvg("", "470 0 470 500")}
          <div class="lp-team right">${esc(home.short)}<img src="${esc(home.logo)}" alt="" /></div>
          ${order(H.starters).map((p, i) => chip(p, i, true)).join("") || `<p class="lp-empty">Quinteto no disponible</p>`}
        </div>
      </div>
      <div class="benches">${benchList(away, A.bench)}${benchList(home, H.bench)}</div>
    </div>`;
  },

  lineupPlayer(a = {}) {
    const name = a.displayName ?? "";
    return { id: a.id, name, short: a.shortName ?? name, pos: a.position?.abbreviation ?? "", jersey: a.jersey ?? "", photo: safeUrl(a.headshot?.href) || (a.id ? `https://a.espncdn.com/i/headshots/nba/players/full/${a.id}.png` : "") };
  },

  // Titulares del último partido terminado del equipo
  async probableLineup(team) {
    if (this.probable[team.id]) return this.probable[team.id];
    let res = { starters: [], bench: [] };
    try {
      let events = await Api.teamSchedule(team.id);
      let done = events.filter((e) => e.competitions?.[0]?.status?.type?.completed && String(e.id) !== String(this.id));
      if (!done.length) {
        events = await Api.teamSchedule(team.id, 1);
        done = events.filter((e) => e.competitions?.[0]?.status?.type?.completed && String(e.id) !== String(this.id));
      }
      const last = done.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      if (last) {
        const s = await Api.summary(last.id, false);
        const g = (s.boxscore?.players ?? []).find((x) => String(x.team?.id) === team.id);
        const ath = g?.statistics?.[0]?.athletes ?? [];
        res = { starters: ath.filter((a) => a.starter).map((a) => this.lineupPlayer(a.athlete)), bench: [] };
      }
    } catch {}
    if (res.starters.length < 5) {
      try {
        const roster = await Api.roster(team.id);
        res.starters = roster.slice(0, 5).map((p) => ({ ...p, short: p.name }));
      } catch {}
    }
    return (this.probable[team.id] = res);
  },

  injuredNames() {
    const map = new Map();
    (this.data.injuries ?? []).forEach((t) => (t.injuries ?? []).forEach((i) => {
      if (i.athlete?.displayName) map.set(i.athlete.displayName, ({ Out: "Baja", "Day-To-Day": "Duda" })[i.status] ?? i.status ?? "Lesionado");
    }));
    return map;
  },

  // ----- Bajas -----
  paneInjuries(el) {
    const inj = this.data.injuries ?? [];
    const blocks = [this.side("away"), this.side("home")].map((t) => {
      const list = inj.find((x) => String(x.team?.id) === t.id)?.injuries ?? [];
      return `<div class="inj-team" style="--c:${t.color}">
        <h3><img src="${esc(t.logo)}" alt="" />${esc(t.name)}<span>${list.length}</span></h3>
        ${list.length ? list.map((i) => `
          <div class="inj-row">
            <div class="inj-photo">${i.athlete?.headshot?.href ? `<img src="${esc(safeUrl(i.athlete.headshot.href))}" alt="" onerror="this.remove()" />` : ""}</div>
            <div class="inj-info"><strong>${esc(i.athlete?.displayName ?? "")}</strong><span>${esc([i.details?.type, i.details?.detail, i.shortComment].filter(Boolean).join(" · "))}</span></div>
            <span class="status ${/out/i.test(i.status) ? "out" : "dtd"}">${esc(({ Out: "Baja", "Day-To-Day": "Día a día" })[i.status] ?? i.status ?? "")}</span>
          </div>`).join("") : `<p class="muted">Sin bajas comunicadas.</p>`}
      </div>`;
    });
    el.innerHTML = `<div class="inj-grid">${blocks.join("")}</div>`;
  },
};

// Pista completa en SVG (94 x 50 pies, escala x10)
function courtSvg(inner, viewBox = "0 0 940 500") {
  return `<svg class="court-svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="940" height="500" class="c-floor"/>
    <g class="c-lines">
      <rect x="2" y="2" width="936" height="496"/>
      <line x1="470" y1="2" x2="470" y2="498"/>
      <circle cx="470" cy="250" r="60"/><circle cx="470" cy="250" r="20"/>
      <rect x="2" y="170" width="190" height="160" class="c-paint"/><rect x="748" y="170" width="190" height="160" class="c-paint"/>
      <circle cx="192" cy="250" r="60"/><circle cx="748" cy="250" r="60"/>
      <path d="M2 30 H140 A237.5 237.5 0 0 1 140 470 H2"/><path d="M938 30 H800 A237.5 237.5 0 0 0 800 470 H938"/>
      <path d="M52 210 A40 40 0 0 1 52 290"/><path d="M888 210 A40 40 0 0 0 888 290"/>
      <line x1="40" y1="220" x2="40" y2="280" class="c-board"/><line x1="900" y1="220" x2="900" y2="280" class="c-board"/>
      <circle cx="52" cy="250" r="7.5" class="c-rim"/><circle cx="888" cy="250" r="7.5" class="c-rim"/>
    </g>
    ${inner}
  </svg>`;
}
