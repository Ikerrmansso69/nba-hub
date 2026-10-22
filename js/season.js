// ---------- Temporada: carrera por el MVP, récords y rachas, grupos de la NBA Cup y "Anoche" ----------

// Carrera por el MVP con una fórmula propia (no oficial)
async function renderMvpRace() {
  const el = $("#mvp-race");
  if (!el) return;
  skeleton(el, 1, 420);
  await Players.load();
  let standings = [];
  try { standings = (await Api.standings()).flatMap((c) => c.teams); } catch {}
  const winPct = (abbr) => {
    const t = standings.find((x) => x.abbr === abbr);
    return t && t.wins + t.losses ? t.wins / (t.wins + t.losses) : 0.5;
  };
  const record = (abbr) => { const t = standings.find((x) => x.abbr === abbr); return t ? `${t.wins}-${t.losses}` : ""; };
  const all = Players.data?.players ?? [];
  const maxGp = Math.max(1, ...all.map((p) => p.s.gamesPlayed ?? 0));
  const ranked = all
    .filter((p) => (p.s.gamesPlayed ?? 0) >= Math.max(1, Math.floor(maxGp * 0.6)))
    .map((p) => {
      const s = p.s, abbr = String(p.team).toLowerCase();
      const prod = (s.avgPoints ?? 0) + 1.2 * (s.avgRebounds ?? 0) + 1.5 * (s.avgAssists ?? 0) + 2 * (s.avgSteals ?? 0) + 2 * (s.avgBlocks ?? 0) - 1.5 * (s.avgTurnovers ?? 0);
      return { p, abbr, score: prod * (0.55 + 0.9 * winPct(abbr)) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  if (!ranked.length) return empty(el, "Todavía no hay estadísticas suficientes.");
  const top = ranked[0].score;
  el.innerHTML = `
    <div class="mvp-race">${ranked.map(({ p, abbr, score }, i) => `
      <a class="mr-row ${i === 0 ? "first" : ""}" href="#jugador/${esc(p.id)}" style="--c:${colorOf(abbr)}">
        <span class="mr-pos">${i + 1}</span>
        <img class="mr-photo" src="${esc(safeUrl(p.photo) || PLACEHOLDER)}" alt="" loading="lazy" onerror="this.src=PLACEHOLDER" />
        <span class="mr-name"><strong>${esc(p.name)}</strong><small><img src="${LOGO(abbr)}" alt="" />${esc(p.teamName ?? p.team ?? "")} · ${esc(record(abbr))}</small></span>
        <span class="mr-stats">${fmtStat(p.s.avgPoints)} PTS · ${fmtStat(p.s.avgRebounds)} REB · ${fmtStat(p.s.avgAssists)} AST</span>
        <span class="mr-bar"><i style="width:${(score / top) * 100}%"></i></span>
        <b class="mr-score">${score.toFixed(1)}</b>
      </a>`).join("")}</div>
    <p class="muted note">Índice NBA Hub (no oficial): puntos + 1,2×rebotes + 1,5×asistencias + 2×(robos + tapones) − 1,5×pérdidas, ponderado por el porcentaje de victorias del equipo. Temporada ${esc(Players.data.season)}, mínimo el 60 % de los partidos del líder.</p>`;
}

// Récords y rachas de la temporada en curso
async function renderSeasonRecords() {
  const el = $("#season-records");
  if (!el) return;
  skeleton(el, 4, 220);
  let season = null, standings = [];
  try { season = await Api.season(); } catch {}
  try { standings = (await Api.standings()).flatMap((c) => c.teams); } catch {}
  const perfs = season?.perfs ?? [];
  const date = (d) => new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const perfRow = (x, main) => `
    <a class="rec-row" href="#partido/${esc(x.event)}">
      <img src="${LOGO(String(x.team).toLowerCase())}" alt="" loading="lazy" />
      <span><strong>${esc(x.name)}</strong><small>vs ${esc(x.opp ?? "")} · ${date(x.date)}</small></span>
      <b>${main(x)}</b>
    </a>`;
  const block = (title, rows) => `<div class="card-block rec-block"><h3>${title}</h3>${rows || `<p class="muted">Todavía nada esta temporada.</p>`}</div>`;
  const streak = (s) => { const m = /^([WL])(\d+)$/.exec(s ?? ""); return m ? (m[1] === "W" ? +m[2] : -m[2]) : 0; };
  const hot = standings.filter((t) => streak(t.streak) >= 2).sort((a, b) => streak(b.streak) - streak(a.streak)).slice(0, 5);
  const cold = standings.filter((t) => streak(t.streak) <= -2).sort((a, b) => streak(a.streak) - streak(b.streak)).slice(0, 5);
  const teamRow = (t, txt) => `<a class="rec-row" href="#equipo/${esc(t.abbr)}"><img src="${esc(t.logo || LOGO(t.abbr))}" alt="" /><span><strong>${esc(t.name)}</strong><small>${t.wins}-${t.losses}</small></span><b>${txt}</b></a>`;
  el.innerHTML = [
    block("🔥 Rachas de victorias", hot.map((t) => teamRow(t, `${streak(t.streak)} seguidas`)).join("")),
    block("🧊 Rachas de derrotas", cold.map((t) => teamRow(t, `${-streak(t.streak)} seguidas`)).join("")),
    block("🎯 Más puntos en un partido", perfs.slice().sort((a, b) => b.pts - a.pts).slice(0, 8).map((x) => perfRow(x, (y) => `${y.pts} pts`)).join("")),
    block("✨ Triples-dobles", perfs.filter((x) => x.td).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8).map((x) => perfRow(x, (y) => `${y.pts}/${y.reb}/${y.ast}`)).join("")),
    block("🏹 Más triples en un partido", perfs.filter((x) => x.threes >= 5).sort((a, b) => b.threes - a.threes).slice(0, 6).map((x) => perfRow(x, (y) => `${y.threes} triples`)).join("")),
    block("💯 Más puntos de un equipo", (season?.teamHighs ?? []).slice(0, 6).map((x) => `
      <a class="rec-row" href="#partido/${esc(x.event)}"><img src="${LOGO(String(x.team).toLowerCase())}" alt="" /><span><strong>${esc(nickname(teamByAbbr(String(x.team).toLowerCase()) ?? { name: x.team }))}</strong><small>vs ${esc(x.opp ?? "")} · ${date(x.date)}</small></span><b>${x.pts}</b></a>`).join("")),
  ].join("") + `<p class="muted note rec-note">Récords recogidos automáticamente de los partidos de temporada regular desde el 20 de octubre (${season?.processed?.length ?? 0} partidos analizados). Las rachas aparecen a partir de 2 partidos seguidos.</p>`;
}

// Grupos de la NBA Cup con su clasificación
async function renderCupGroups() {
  const el = $("#cup-groups");
  if (!el) return;
  skeleton(el, 6, 230);
  let data = null;
  try { data = await Api.cup(); } catch {}
  const games = data?.games ?? [];
  const tables = Object.entries(CUP_GROUPS).map(([name, teams]) => {
    const rows = teams.map((abbr) => ({ abbr, w: 0, l: 0, pf: 0, pa: 0 }));
    const get = (a) => rows.find((r) => r.abbr === a);
    const groupGames = games.filter((g) => g.group === name);
    groupGames.filter((g) => g.completed).forEach((g) => {
      const [x, y] = g.teams.map((t) => ({ ...t, abbr: String(t.abbr).toLowerCase(), score: +t.score || 0 }));
      const rx = get(x.abbr), ry = get(y.abbr);
      if (!rx || !ry) return;
      rx.pf += x.score; rx.pa += y.score; ry.pf += y.score; ry.pa += x.score;
      if (x.score > y.score) { rx.w++; ry.l++; } else { ry.w++; rx.l++; }
    });
    rows.sort((a, b) => b.w - a.w || a.l - b.l || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf);
    const next = groupGames.filter((g) => !g.completed).slice(0, 2);
    return { name, rows, next };
  });
  // Mejor segundo de cada conferencia (comodín)
  ["Este", "Oeste"].forEach((conf) => {
    const seconds = tables.filter((t) => t.name.startsWith(conf)).map((t) => t.rows[1]).filter((r) => r && r.w + r.l > 0)
      .sort((a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa));
    if (seconds[0]) seconds[0].wild = true;
  });
  const played = games.some((g) => g.completed);
  el.innerHTML = tables.map((t) => `
    <div class="cup-group">
      <h3>${esc(t.name)}</h3>
      <table class="table compact">
        <thead><tr><th>Equipo</th><th>V</th><th>D</th><th>DIF</th></tr></thead>
        <tbody>${t.rows.map((r, i) => `<tr class="${played && i === 0 && r.w ? "leader" : ""} ${r.wild ? "wild" : ""} ${Favs.has(r.abbr) ? "fav" : ""}">
          <td><a class="team-cell" href="#equipo/${esc(r.abbr)}"><img src="${LOGO(r.abbr)}" alt="" loading="lazy" />${esc(nickname(teamByAbbr(r.abbr)))}</a></td>
          <td class="num">${r.w}</td><td class="num">${r.l}</td><td class="num">${r.pf - r.pa > 0 ? "+" : ""}${r.pf - r.pa}</td></tr>`).join("")}</tbody>
      </table>
      ${t.next.length ? `<div class="cup-next">${t.next.map((g) => {
        const [a, b] = g.teams;
        const away = g.teams.find((x) => x.homeAway === "away") ?? a, home = g.teams.find((x) => x.homeAway === "home") ?? b;
        return `<a href="#partido/${esc(g.id)}"><small>${new Date(g.date).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</small> ${esc(String(away.abbr))} @ ${esc(String(home.abbr))}</a>`;
      }).join("")}</div>` : ""}
    </div>`).join("") +
    `<p class="muted note cup-legend"><span class="lg-dot leader"></span> Líder de grupo (pasa a cuartos) · <span class="lg-dot wild"></span> Mejor segundo de la conferencia (comodín) · Desempate simplificado: victorias y diferencia de puntos.</p>`;
}

// "Anoche en la NBA": crónica corta de cada partido terminado
const LastNight = {
  done: false,
  async render(all) {
    const el = $("#last-night");
    if (!el || this.done) return;
    const finals = all.filter((g) => g.state === "post");
    if (!finals.length) return;
    // Solo la última jornada terminada (fecha de EE. UU.)
    const etDay = (d) => new Date(+d - 5 * 3600e3).toISOString().slice(0, 10);
    const day = etDay(finals.at(-1).date);
    const list = favFirst(finals.filter((g) => etDay(g.date) === day)).slice(0, 10);
    this.done = true;
    $("#last-night-wrap").hidden = false;
    $("#last-night-date").textContent = new Date(day + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    el.innerHTML = list.map((g) => `<a class="ln-card" id="ln-${esc(g.id)}" href="#partido/${esc(g.id)}" style="--ca:${colorOf(g.away.abbr)};--ch:${colorOf(g.home.abbr)}">
        <div class="ln-score">
          <span class="${g.away.winner ? "w" : ""}"><img src="${esc(g.away.logo || LOGO(g.away.abbr))}" alt="" />${esc(g.away.short)} <b>${esc(g.away.score)}</b></span>
          <span class="${g.home.winner ? "w" : ""}"><b>${esc(g.home.score)}</b> ${esc(g.home.short)}<img src="${esc(g.home.logo || LOGO(g.home.abbr))}" alt="" /></span>
        </div>
        <p class="ln-story"><span class="skel" style="display:block;height:44px"></span></p>
      </a>`).join("");
    await Promise.all(list.map(async (g) => {
      const p = $(`#ln-${CSS.escape(g.id)} .ln-story`);
      try {
        const s = await Api.summary(g.id, false);
        const view = Object.assign(Object.create(Game), { data: s, id: g.id });
        p.textContent = view.autoSummary(view.flow()) || "";
      } catch { p.textContent = ""; }
    }));
  },
};
