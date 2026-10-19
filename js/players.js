// ---------- Fichas de jugador, comparador y líderes de la liga ----------
const STAT_DEFS = [
  ["avgPoints", "Puntos", "PTS"],
  ["avgRebounds", "Rebotes", "REB"],
  ["avgAssists", "Asistencias", "AST"],
  ["avgSteals", "Robos", "ROB"],
  ["avgBlocks", "Tapones", "TAP"],
  ["avgTurnovers", "Pérdidas", "PÉR", true], // true = menos es mejor
  ["fieldGoalPct", "% Tiros de campo", "TC%"],
  ["threePointFieldGoalPct", "% Triples", "3P%"],
  ["freeThrowPct", "% Tiros libres", "TL%"],
  ["avgMinutes", "Minutos", "MIN"],
  ["gamesPlayed", "Partidos", "PJ"],
];
const fmtStat = (v) => (v === undefined || v === null || v === "" ? "–" : typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : v);

const Players = {
  data: null,
  loading: null,
  cmp: [null, null],

  load() {
    this.loading ||= Api.players().then((d) => (this.data = d)).catch(() => (this.loading = null));
    return this.loading;
  },
  byId(id) { return this.data?.players.find((p) => String(p.id) === String(id)); },

  // ----- Ficha de jugador -----
  async open(id) {
    const el = $("#player-page");
    el.innerHTML = `<div class="skel" style="height:260px"></div><div class="skel" style="height:140px;margin-top:16px"></div>`;
    await this.load();
    const lite = this.byId(id);
    let bio = null, log = null;
    [bio, log] = await Promise.all([Api.athlete(id).then((d) => d.athlete ?? d).catch(() => null), Api.gamelog(id).catch(() => null)]);
    if (location.hash !== `#jugador/${id}`) return;
    if (!lite && !bio) {
      el.innerHTML = `<p class="muted">No se encontraron datos de este jugador. <a class="link" href="https://www.espn.com/nba/player/_/id/${esc(id)}" target="_blank" rel="noopener">Ver en ESPN →</a></p>`;
      return;
    }
    const name = bio?.displayName ?? lite?.name ?? "";
    const abbr = (bio?.team?.abbreviation ?? lite?.team ?? "").toLowerCase();
    const team = teamByAbbr(abbr);
    const photo = safeUrl(bio?.headshot?.href) || safeUrl(lite?.photo) || `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
    const facts = [
      ["Posición", bio?.position?.displayName ?? lite?.pos],
      ["Edad", bio?.age ?? lite?.age],
      ["Altura", bio?.displayHeight],
      ["Peso", bio?.displayWeight],
      ["Nacimiento", [bio?.displayDOB, bio?.displayBirthPlace].filter(Boolean).join(" · ")],
      ["Draft", bio?.displayDraft],
      ["Universidad", bio?.college?.name],
      ["Experiencia", bio?.displayExperience],
    ].filter(([, v]) => v);
    const s = lite?.s ?? {};
    const tiles = STAT_DEFS.filter(([k]) => s[k] !== undefined).map(([k, l, short]) => `<div class="pstat"><b>${fmtStat(s[k])}</b><small>${short}</small><span>${l}</span></div>`).join("");

    el.innerHTML = `
      <div class="p-hero" style="--c:${team?.color ?? "#3a4258"};--a:${team?.alt ?? "#ff6b1a"}">
        ${team ? `<img class="wm" src="${LOGO(abbr)}" alt="" />` : ""}
        <div class="p-photo"><img src="${esc(photo)}" alt="${esc(name)}" onerror="this.onerror=null;this.src=PLACEHOLDER" /></div>
        <div class="p-info">
          ${team ? `<a href="#equipos" class="p-team"><img src="${LOGO(abbr)}" alt="" />${esc(team.name)}</a>` : ""}
          <h2>${esc(name)}</h2>
          <p>${[bio?.displayJersey ?? (bio?.jersey ? "#" + bio.jersey : ""), bio?.position?.displayName ?? lite?.pos].filter(Boolean).map(esc).join(" · ")}</p>
          <div class="p-actions">
            <button class="btn primary" id="p-compare">Comparar con otro jugador</button>
            <a class="btn" href="https://www.espn.com/nba/player/_/id/${esc(id)}" target="_blank" rel="noopener">Ver en ESPN ↗</a>
            ${team ? starBtn(abbr, "big") : ""}
          </div>
        </div>
      </div>
      ${tiles ? `<div class="section-head"><div><p class="kicker">Promedios por partido</p><h2>Temporada ${esc(this.data?.season ?? "")}</h2></div></div><div class="pstats">${tiles}</div>` : ""}
      ${facts.length ? `<div class="section-head"><div><p class="kicker">Biografía</p><h2>Datos</h2></div></div><dl class="p-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      <div id="p-log"></div>`;
    $("#p-compare").addEventListener("click", () => {
      this.cmp[0] = id;
      location.hash = "#jugadores";
      setTimeout(() => { this.renderCompare(); $("#comparador")?.scrollIntoView({ behavior: "smooth" }); $("#cmp-b")?.focus(); }, 80);
    });
    this.renderLog(log);
  },

  // Últimos partidos con gráfico de puntos
  renderLog(log) {
    const el = $("#p-log");
    if (!log) return;
    const names = log.names ?? [];
    const labels = log.labels ?? [];
    const idx = (n, l) => { const i = names.indexOf(n); return i >= 0 ? i : labels.indexOf(l); };
    const iPts = idx("points", "PTS"), iReb = idx("totalRebounds", "REB"), iAst = idx("assists", "AST"), iMin = idx("minutes", "MIN"), iFg = idx("fieldGoalsMade-fieldGoalsAttempted", "FG");
    const games = (log.seasonTypes ?? []).flatMap((st) => (st.categories ?? []).filter((c) => c.type === "event").flatMap((c) => c.events ?? []));
    const rows = games
      .map((g) => ({ ev: log.events?.[g.eventId] ?? {}, st: g.stats ?? [] }))
      .filter((g) => g.ev.gameDate)
      .sort((a, b) => new Date(b.ev.gameDate) - new Date(a.ev.gameDate))
      .slice(0, 10);
    if (!rows.length) return;
    const pts = rows.map((r) => +r.st[iPts] || 0).reverse();
    const max = Math.max(...pts, 10);
    const chart = `<div class="p-chart">${pts.map((v, i) => `<div class="bar-col"><span style="height:${(v / max) * 100}%"><b>${v}</b></span><small>${rows[rows.length - 1 - i].ev.opponent?.abbreviation ?? ""}</small></div>`).join("")}</div>`;
    el.innerHTML = `
      <div class="section-head"><div><p class="kicker">Forma</p><h2>Últimos partidos</h2></div></div>
      <div class="card-block">
        <h3>Puntos por partido</h3>${chart}
        <div class="table-wrap" style="margin-top:16px"><table class="table compact">
          <thead><tr><th>Fecha</th><th>Rival</th><th>Res.</th><th>MIN</th><th>TC</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td>${new Date(r.ev.gameDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</td>
            <td><span class="team-cell">${r.ev.opponent?.logo ? `<img src="${esc(safeUrl(r.ev.opponent.logo))}" alt="" />` : ""}${esc(r.ev.atVs ?? "")} ${esc(r.ev.opponent?.abbreviation ?? "")}</span></td>
            <td class="${r.ev.gameResult === "W" ? "res-w" : "res-l"}">${esc(r.ev.gameResult ?? "")} ${esc(r.ev.score ?? "")}</td>
            <td class="num">${esc(r.st[iMin] ?? "")}</td><td class="num">${esc(r.st[iFg] ?? "")}</td>
            <td class="num"><strong>${esc(r.st[iPts] ?? "")}</strong></td><td class="num">${esc(r.st[iReb] ?? "")}</td><td class="num">${esc(r.st[iAst] ?? "")}</td>
          </tr>`).join("")}</tbody>
        </table></div>
      </div>`;
  },

  // ----- Líderes de la liga -----
  async renderLeaders() {
    const el = $("#league-leaders");
    skeleton(el, 6, 260);
    await this.load();
    if (!this.data?.players?.length) return empty(el, "No se pudieron cargar las estadísticas.");
    $("#leaders-season").textContent = `Temporada ${this.data.season}`;
    const pool = this.data.players.filter((p) => (p.s.gamesPlayed ?? 0) >= Math.min(10, Math.max(...this.data.players.map((x) => x.s.gamesPlayed ?? 0)) / 2));
    const cats = [["avgPoints", "Puntos"], ["avgRebounds", "Rebotes"], ["avgAssists", "Asistencias"], ["avgSteals", "Robos"], ["avgBlocks", "Tapones"], ["avgThreePointFieldGoalsMade", "Triples por partido"]];
    el.innerHTML = cats.map(([k, label]) => {
      const top = pool.filter((p) => typeof p.s[k] === "number").sort((a, b) => b.s[k] - a.s[k]).slice(0, 5);
      if (!top.length) return "";
      const [first, ...rest] = top;
      const c = colorOf(String(first.team).toLowerCase());
      return `<div class="leader-card" style="--c:${c}">
        <h3>${label}</h3>
        <a class="lc-first" href="#jugador/${esc(first.id)}">
          <img src="${esc(safeUrl(first.photo) || PLACEHOLDER)}" alt="" loading="lazy" onerror="this.src=PLACEHOLDER" />
          <div><strong>${esc(first.name)}</strong><small>${esc(first.team ?? "")}</small></div>
          <b>${fmtStat(first.s[k])}</b>
        </a>
        ${rest.map((p, i) => `<a class="lc-row" href="#jugador/${esc(p.id)}"><span>${i + 2}</span><img src="${LOGO(String(p.team).toLowerCase())}" alt="" loading="lazy" />${esc(p.name)}<b>${fmtStat(p.s[k])}</b></a>`).join("")}
      </div>`;
    }).join("");
  },

  // ----- Comparador -----
  async initCompare() {
    await this.load();
    if (!this.data?.players?.length) return empty($("#cmp-result"), "No se pudieron cargar las estadísticas.");
    $("#cmp-list").innerHTML = this.data.players.map((p) => `<option value="${esc(p.name)} (${esc(p.team ?? "")})"></option>`).join("");
    const find = (v) => this.data.players.find((p) => `${p.name} (${p.team ?? ""})` === v || p.name.toLowerCase() === v.trim().toLowerCase());
    ["a", "b"].forEach((k, i) => {
      const input = $(`#cmp-${k}`);
      input.addEventListener("change", () => {
        const p = find(input.value);
        if (p) { this.cmp[i] = p.id; this.renderCompare(); }
      });
    });
    if (!this.cmp[0]) {
      const [a, b] = this.data.players;
      this.cmp = [a?.id, b?.id];
    }
    this.renderCompare();
  },

  renderCompare() {
    if (!this.data) return;
    const [A, B] = this.cmp.map((id) => this.byId(id));
    if (A) $("#cmp-a").value = `${A.name} (${A.team ?? ""})`;
    if (B) $("#cmp-b").value = `${B.name} (${B.team ?? ""})`; else $("#cmp-b").value = "";
    const el = $("#cmp-result");
    if (!A || !B) return (el.innerHTML = `<p class="muted">Elige dos jugadores para compararlos.</p>`);
    const ca = colorOf(String(A.team).toLowerCase()), cb = colorOf(String(B.team).toLowerCase());
    const cbFix = ca === cb ? teamByAbbr(String(B.team).toLowerCase())?.alt ?? "#ff6b1a" : cb;
    const head = (p, c) => `<a class="cmp-head" href="#jugador/${esc(p.id)}" style="--c:${c}"><img src="${esc(safeUrl(p.photo) || PLACEHOLDER)}" alt="" onerror="this.src=PLACEHOLDER" /><strong>${esc(p.name)}</strong><small>${esc(p.teamName ?? p.team ?? "")} · ${esc(p.pos ?? "")}</small></a>`;
    let winsA = 0, winsB = 0;
    const rows = STAT_DEFS.map(([k, label, , lowerBetter]) => {
      const a = A.s[k], b = B.s[k];
      if (typeof a !== "number" || typeof b !== "number") return "";
      const aBetter = lowerBetter ? a < b : a > b, bBetter = lowerBetter ? b < a : b > a;
      if (k !== "gamesPlayed" && k !== "avgMinutes") { if (aBetter) winsA++; if (bBetter) winsB++; }
      const total = a + b || 1;
      return `<div class="stat-row">
        <div class="stat-vals"><b class="${aBetter ? "hi" : ""}">${fmtStat(a)}</b><span>${label}</span><b class="${bBetter ? "hi" : ""}">${fmtStat(b)}</b></div>
        <div class="stat-bars"><div><span style="width:${(a / total) * 100}%;background:${ca}"></span></div><div><span style="width:${(b / total) * 100}%;background:${cbFix}"></span></div></div>
      </div>`;
    }).join("");
    el.innerHTML = `
      <div class="cmp-heads">${head(A, ca)}<div class="cmp-score"><b>${winsA}</b><small>categorías ganadas</small><b>${winsB}</b></div>${head(B, cbFix)}</div>
      <div class="card-block stats-card">${rows}</div>
      <p class="muted note">Promedios de la temporada ${esc(this.data.season)}.</p>`;
  },
};
