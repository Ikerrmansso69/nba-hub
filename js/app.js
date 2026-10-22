// ---------- Utilidades ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const teamByAbbr = (abbr) => TEAMS.find((t) => t.abbr === abbr);
const colorOf = (abbr) => teamByAbbr(abbr)?.color ?? "#3a4258";
const SEASON_START = new Date("2026-10-20T00:00:00");
const OPENING_TIPOFF = new Date("2026-10-20T23:00:00Z"); // 76ers @ Knicks, 7:00 p.m. ET
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

const fmtDate = (d) => d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (d) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const sameDay = (a, b) => ymd(a) === ymd(b);
const empty = (el, msg) => (el.innerHTML = `<p class="muted">${msg}</p>`);
const skeleton = (el, n = 6, h = 168) =>
  (el.innerHTML = Array.from({ length: n }, () => `<div class="skel" style="height:${h}px"></div>`).join(""));

const SEASON_LABEL = { 1: "Pretemporada", 2: "Temporada regular", 3: "Playoffs", 5: "Play-in" };

// ---------- Mis equipos (favoritos guardados en el navegador) ----------
const Favs = {
  set: new Set((() => { try { return JSON.parse(localStorage.getItem("nbahub-favs") || "[]"); } catch { return []; } })()),
  has(abbr) { return this.set.has(abbr); },
  toggle(abbr) {
    this.set.has(abbr) ? this.set.delete(abbr) : this.set.add(abbr);
    try { localStorage.setItem("nbahub-favs", JSON.stringify([...this.set])); } catch {}
    $$(`[data-fav="${abbr}"]`).forEach((b) => { b.classList.toggle("on", this.has(abbr)); b.setAttribute("aria-pressed", this.has(abbr)); });
    toast(this.has(abbr) ? `⭐ Ahora sigues a los <strong>${esc(teamByAbbr(abbr).name)}</strong>` : `Has dejado de seguir a los ${esc(teamByAbbr(abbr).name)}`);
    document.dispatchEvent(new Event("favs"));
  },
  inGame(g) { return this.has(g.away.abbr) || this.has(g.home.abbr); },
  // Noticia relacionada con alguno de mis equipos
  inNews(a) {
    return [...this.set].some((abbr) => {
      const t = teamByAbbr(abbr);
      // Etiquetado con el equipo (solo si la noticia es de pocos equipos) o lo nombra en el titular
      return ((a.teamIds?.length ?? 0) <= 3 && a.teamIds?.includes(String(t.espn))) || new RegExp(`\\b${nickname(t)}\\b`, "i").test(a.headline);
    });
  },
};
const starBtn = (abbr, extra = "") =>
  `<button class="star ${Favs.has(abbr) ? "on" : ""} ${extra}" data-fav="${abbr}" aria-pressed="${Favs.has(abbr)}" aria-label="Seguir a ${esc(teamByAbbr(abbr)?.name ?? abbr)}" title="Seguir equipo">★</button>`;
const favFirst = (list) => list.slice().sort((a, b) => Favs.inGame(b) - Favs.inGame(a));

// ---------- Partidos ----------
function gameCard(g) {
  const side = (t, isWinner) => `
    <div class="g-team ${isWinner ? "win" : ""}">
      <img src="${esc(t.logo || LOGO(t.abbr))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
      <div class="g-name"><strong>${esc(t.short || t.name)}</strong><small>${esc(t.record)}</small></div>
      <span class="g-score">${g.state === "pre" ? "" : esc(t.score)}</span>
    </div>`;
  const status =
    g.state === "pre"
      ? g.noTime ? fmtDate(g.date) : `${fmtDate(g.date)} · <span class="g-time">${fmtTime(g.date)}</span>`
      : g.state === "in"
      ? `<span class="live">EN VIVO</span> ${esc(g.detail)}`
      : `Final · ${fmtDate(g.date)}`;
  const tag = g.note || SEASON_LABEL[g.seasonType] || "";
  const tagName = g.id ? "a" : "article";
  const cta = g.id ? `<span class="g-cta">${g.state === "in" ? "Seguir en directo" : g.state === "post" ? "Ver estadísticas" : "Previa y quintetos"} →</span>` : "";
  return `
    <${tagName} class="game ${g.state === "in" ? "is-live" : ""} ${Favs.inGame(g) ? "fav" : ""}" ${g.id ? `href="#partido/${esc(g.id)}"` : ""} style="--ca:${colorOf(g.away.abbr)};--ch:${colorOf(g.home.abbr)}">
      <div class="g-head"><span>${status}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>
      ${side(g.away, g.away.winner)}
      ${side(g.home, g.home.winner)}
      <div class="g-foot">${esc([g.venue, g.tv].filter(Boolean).join(" · "))}${cta}</div>
    </${tagName}>`;
}

function fallbackGames() {
  return FALLBACK_GAMES.map((f) => {
    const t = (abbr) => {
      const team = teamByAbbr(abbr);
      return { abbr, name: team.name, short: nickname(team), logo: LOGO(abbr), record: "" };
    };
    return { date: new Date(f.date + "T12:00:00"), noTime: true, state: "pre", note: f.note, away: t(f.away), home: t(f.home), venue: teamByAbbr(f.home).arena };
  });
}

// ---------- Ticker ----------
function fillTicker(games) {
  let items;
  if (games?.length) {
    items = games.slice(0, 20).map((g) => {
      const score = g.state === "pre" ? (g.noTime ? fmtDate(g.date) : `${fmtDate(g.date)} ${fmtTime(g.date)}`) : `${g.away.score}-${g.home.score}`;
      const flag = g.state === "in" ? "<em>LIVE</em>" : g.state === "post" ? "<em>FINAL</em>" : "";
      return `<span class="ticker-item">${flag}<img src="${esc(g.away.logo || LOGO(g.away.abbr))}" alt="" />${esc(g.away.short)}
        <b>${esc(score)}</b>${esc(g.home.short)}<img src="${esc(g.home.logo || LOGO(g.home.abbr))}" alt="" /></span>`;
    });
  } else items = [];
  const facts = [
    `<span class="ticker-item"><em>CAMPEÓN</em><img src="${LOGO("ny")}" alt="" />Knicks 4-1 Spurs · Brunson, MVP de las Finales</span>`,
    `<span class="ticker-item"><em>NBA CUP</em>Fase de grupos desde el 30 de octubre · Final el 11 de diciembre</span>`,
    ...RECORDS.slice(0, 5).map((r) => `<span class="ticker-item"><em>RÉCORD</em><b>${esc(r.stat)}</b> ${esc(r.label.toLowerCase())} · ${esc(r.who)}</span>`),
  ];
  const html = [...items, ...facts].join("");
  $("#ticker").innerHTML = html + html; // duplicado para que el bucle sea continuo
}

// ---------- Inicio ----------
function renderCountdown() {
  const el = $("#countdown");
  const tick = () => {
    const diff = OPENING_TIPOFF - new Date();
    if (diff <= 0) {
      el.innerHTML = `<div class="sb-title"><span>Temporada 2026-27</span><span>En marcha</span></div>
        <div class="sb-digits" style="grid-template-columns:1fr"><div><b>¡A JUGAR!</b><small>La temporada ya ha empezado</small></div></div>`;
      return false;
    }
    const s = Math.floor(diff / 1000);
    const parts = [[Math.floor(s / 86400), "días"], [Math.floor(s / 3600) % 24, "horas"], [Math.floor(s / 60) % 60, "min"], [s % 60, "seg"]];
    el.innerHTML = `
      <div class="sb-title"><span>Noche inaugural</span><span>20 OCT</span></div>
      <div class="sb-digits">${parts.map(([v, l]) => `<div><b>${String(v).padStart(2, "0")}</b><small>${l}</small></div>`).join("")}</div>
      <div class="sb-match"><img src="${LOGO("phi")}" alt="" />76ers <span>@</span> Knicks<img src="${LOGO("ny")}" alt="" /></div>`;
    return true;
  };
  if (tick()) setInterval(tick, 1000);
}

async function renderUpcoming(silent = false) {
  const el = $("#upcoming");
  if (!silent) skeleton(el, 4);
  try {
    const now = new Date();
    const to = new Date(now.getTime() + 7 * 86400000);
    const all = await Api.scoreboard(new Date(now.getTime() - 86400000), to, silent);
    fillTicker(all);
    $("#fb-note")?.remove();
    // En directo primero, luego los próximos
    watchFavGames(all);
    $("#nav-live").hidden = !all.some((g) => g.state === "in");
    Videos.loadHome(all);
    LastNight.render(all);
    upcomingAll = all;
    renderMyTeams();
    const games = favFirst(all.filter((g) => g.state !== "post").sort((a, b) => (b.state === "in") - (a.state === "in") || a.date - b.date));
    if (!games.length) throw new Error("sin partidos");
    el.innerHTML = games.slice(0, 15).map(gameCard).join("");
  } catch {
    if (silent) return;
    const fb = fallbackGames();
    fillTicker(fb);
    el.innerHTML = fb.map(gameCard).join("");
    el.insertAdjacentHTML("beforebegin", `<p class="fallback-note" id="fb-note">No se pudo cargar el calendario ahora mismo (ni de ESPN ni de la copia de respaldo). Se reintentará en 30 segundos.</p>`);
  }
}

// Avisos cuando empieza o termina un partido de mis equipos
let upcomingAll = [];
const gameStates = new Map();
function watchFavGames(all) {
  all.forEach((g) => {
    const prev = gameStates.get(g.id);
    gameStates.set(g.id, g.state);
    if (!prev || prev === g.state || !Favs.inGame(g)) return;
    const title = `${esc(g.away.short)} ${g.state === "pre" ? "@" : esc(g.away.score) + " - " + esc(g.home.score)} ${esc(g.home.short)}`;
    if (g.state === "in") toast(`<span class="ntag new">Empieza</span><strong>⭐ ${title}</strong>`, `#partido/${g.id}`);
    if (g.state === "post") toast(`<span class="ntag game">Final</span><strong>⭐ ${title}</strong>`, `#partido/${g.id}`);
  });
}

// Bloque "Mis equipos" de la portada
function renderMyTeams() {
  const el = $("#my-teams");
  if (!el) return;
  if (!Favs.set.size) {
    el.innerHTML = `<a href="#equipos" class="my-empty"><span class="star on">★</span><div><strong>Sigue a tus equipos</strong><p>Pulsa la estrella de cualquier equipo para ver aquí su próximo partido y sus noticias, y recibir avisos cuando empiece o termine un partido.</p></div></a>`;
    return;
  }
  el.innerHTML = [...Favs.set].map((abbr) => {
    const t = teamByAbbr(abbr);
    const games = upcomingAll.filter((g) => g.away.abbr === abbr || g.home.abbr === abbr);
    const next = games.find((g) => g.state === "in") ?? games.find((g) => g.state === "pre");
    const last = games.filter((g) => g.state === "post").at(-1);
    const news = (typeof News !== "undefined" ? News.items : []).find((a) => ((a.teamIds?.length ?? 0) <= 3 && a.teamIds?.includes(String(t.espn))) || new RegExp(`\\b${nickname(t)}\\b`, "i").test(a.headline));
    const line = (g, label) => {
      if (!g) return "";
      const rival = g.away.abbr === abbr ? g.home : g.away;
      const at = g.away.abbr === abbr ? "@" : "vs";
      const when = g.state === "in" ? `<span class="live">EN VIVO</span> ${esc(g.away.score)}-${esc(g.home.score)}` : g.state === "post" ? `${esc(g.away.score)}-${esc(g.home.score)}` : `${fmtDate(g.date)} · ${fmtTime(g.date)}`;
      return `<a class="my-game" href="#partido/${esc(g.id)}"><small>${label}</small><span>${at} <img src="${esc(rival.logo || LOGO(rival.abbr))}" alt="" /> ${esc(rival.short)}</span><b>${when}</b></a>`;
    };
    return `<div class="my-team" style="--c:${t.color}">
      <div class="my-head"><img src="${LOGO(abbr)}" alt="" /><strong>${esc(t.name)}</strong>${starBtn(abbr)}</div>
      ${line(next, next?.state === "in" ? "Ahora" : "Próximo partido") || `<p class="muted">Sin partidos en los próximos días.</p>`}
      ${line(last, "Último resultado")}
      ${news ? `<a class="my-news" href="${esc(news.link || "#noticias")}" target="_blank" rel="noopener"><small>Última noticia</small>${esc(news.headline)}</a>` : ""}
    </div>`;
  }).join("");
}

function renderLogoWall() {
  const half = Math.ceil(TEAMS.length / 2);
  const row = (list, rev) => {
    const imgs = list.map((t) => `<img src="${LOGO(t.abbr)}" alt="" loading="lazy" />`).join("");
    return `<div class="logo-row ${rev ? "rev" : ""}">${imgs}${imgs}</div>`;
  };
  $("#logo-wall").innerHTML = row(TEAMS.slice(0, half)) + row(TEAMS.slice(half), true);
}

// ---------- Calendario ----------
let currentDay = new Date() < SEASON_START ? new Date(SEASON_START) : new Date();

function renderWeek() {
  const today = new Date();
  const start = new Date(currentDay.getTime() - 3 * 86400000);
  $("#week-days").innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    const cls = [sameDay(d, currentDay) && "active", sameDay(d, today) && "today"].filter(Boolean).join(" ");
    return `<button class="day ${cls}" data-date="${ymd(d)}">
      <small>${sameDay(d, today) ? "Hoy" : d.toLocaleDateString("es-ES", { weekday: "short" })}</small>
      <b>${d.getDate()}</b>
      <small>${d.toLocaleDateString("es-ES", { month: "short" })}</small>
    </button>`;
  }).join("");
  $("#day-picker").value = ymd(currentDay).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
}

let dayGames = [];
let gameFilter = "all";
function paintDay() {
  const el = $("#day-games");
  const list = favFirst(dayGames.filter((g) => gameFilter === "all" || g.state === gameFilter));
  const live = dayGames.filter((g) => g.state === "in").length;
  $('#game-filter [data-f="in"]').innerHTML = `En directo${live ? ` <span class="count">${live}</span>` : ""}`;
  list.length ? (el.innerHTML = list.map(gameCard).join("")) : empty(el, dayGames.length ? "No hay partidos en este filtro." : "No hay partidos este día.");
}

async function renderDay(silent = false) {
  if (!silent) { renderWeek(); skeleton($("#day-games"), 6); }
  try {
    dayGames = await Api.scoreboard(currentDay, currentDay, silent || sameDay(currentDay, new Date()));
    paintDay();
  } catch {
    if (!silent) empty($("#day-games"), "No se pudieron cargar los partidos. Inténtalo de nuevo más tarde.");
  }
}

function initCalendar() {
  $("#game-filter").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    gameFilter = b.dataset.f;
    $$("#game-filter button").forEach((x) => x.classList.toggle("active", x === b));
    paintDay();
  });
  $("#week-days").addEventListener("click", (e) => {
    const b = e.target.closest(".day");
    if (!b) return;
    const s = b.dataset.date;
    currentDay = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}T12:00:00`);
    renderDay();
  });
  $$(".week-arrow").forEach((b) =>
    b.addEventListener("click", () => {
      currentDay = new Date(currentDay.getTime() + +b.dataset.shift * 86400000);
      renderDay();
    })
  );
  $("#day-picker").addEventListener("change", (e) => {
    if (!e.target.value) return;
    currentDay = new Date(e.target.value + "T12:00:00");
    renderDay();
  });
}

// ---------- Clasificación ----------
async function renderStandings() {
  const el = $("#standings");
  skeleton(el, 2, 520);
  try {
    const confs = await Api.standings();
    if (!confs.length) throw new Error();
    el.innerHTML = confs
      .map(
        (c) => `
      <div class="conf-card">
        <h3>${esc(c.name.replace("Eastern Conference", "Conferencia Este").replace("Western Conference", "Conferencia Oeste"))}</h3>
        <div class="table-scroll"><table class="table compact">
          <thead><tr><th>#</th><th>Equipo</th><th>V</th><th>D</th><th>%</th><th>DIF</th><th>Racha</th></tr></thead>
          <tbody>${c.teams
            .map(
              (t, i) => `
            <tr class="${i < 6 ? "po" : i < 10 ? "pi" : ""} ${i === 5 || i === 9 ? "cut" : ""}">
              <td class="num">${i + 1}</td>
              <td><span class="team-cell"><img src="${esc(t.logo || LOGO(t.abbr))}" alt="" loading="lazy" />${esc(t.name)}</span></td>
              <td class="num">${t.wins}</td><td class="num">${t.losses}</td><td class="num">${esc(t.pct)}</td><td class="num">${esc(t.gb)}</td><td class="num">${esc(t.streak)}</td>
            </tr>`
            )
            .join("")}</tbody>
        </table></div>
      </div>`
      )
      .join("");
    renderBracket(confs);
  } catch {
    empty(el, "No se pudo cargar la clasificación en este momento.");
  }
}

// ---------- Cuadro de playoffs (proyección con la clasificación actual) ----------
function renderBracket(confs) {
  const el = $("#bracket");
  const seedTeam = (t, seed) => {
    if (!t) return `<div class="bt tbd"><span class="seed">${seed}</span>Por decidir</div>`;
    return `<div class="bt ${Favs.has(t.abbr) ? "fav" : ""}" style="--c:${colorOf(t.abbr)}"><span class="seed">${seed}</span><img src="${esc(t.logo || LOGO(t.abbr))}" alt="" />${esc(nickname(teamByAbbr(t.abbr) ?? { name: t.name }))}<small>${t.wins}-${t.losses}</small></div>`;
  };
  const tbd = (label) => `<div class="bt tbd"><span class="seed">·</span>${label}</div>`;
  const conf = (c) => {
    const T = (n) => c.teams[n - 1];
    const name = /east/i.test(c.name) ? "Este" : "Oeste";
    return `<div class="bracket">
      <h3>Conferencia ${name}</h3>
      <div class="br-cols">
        <div class="br-col">
          <small class="br-title">Play-in</small>
          <div class="match">${seedTeam(T(7), 7)}${seedTeam(T(8), 8)}<span class="m-note">Ganador → 7º</span></div>
          <div class="match">${seedTeam(T(9), 9)}${seedTeam(T(10), 10)}<span class="m-note">Ganador vs perdedor 7-8 → 8º</span></div>
        </div>
        <div class="br-col">
          <small class="br-title">Primera ronda</small>
          <div class="match">${seedTeam(T(1), 1)}${tbd("8º (play-in)")}</div>
          <div class="match">${seedTeam(T(4), 4)}${seedTeam(T(5), 5)}</div>
          <div class="match">${seedTeam(T(3), 3)}${seedTeam(T(6), 6)}</div>
          <div class="match">${seedTeam(T(2), 2)}${tbd("7º (play-in)")}</div>
        </div>
        <div class="br-col">
          <small class="br-title">Semifinales</small>
          <div class="match">${tbd("1/8 vs 4/5")}</div>
          <div class="match">${tbd("2/7 vs 3/6")}</div>
        </div>
        <div class="br-col">
          <small class="br-title">Final de conferencia</small>
          <div class="match final">${tbd("Campeón del " + name)}</div>
        </div>
      </div>
    </div>`;
  };
  el.innerHTML = confs.map(conf).join("") + `<p class="muted note">Proyección con la clasificación de hoy. Cambia cada día hasta el final de la temporada regular.</p>`;
}

// ---------- NBA Cup ----------
function renderCup() {
  $("#cup-dates").innerHTML = CUP_2026.map((d) => `<div class="cup-date reveal"><strong>${esc(d.date)}</strong><span>${esc(d.what)}</span></div>`).join("");
  $("#cup-finals").innerHTML = NBA_CUP.map((c) => {
    const ca = FRANCHISE[c.champ], ra = FRANCHISE[c.runner];
    return `
    <article class="ticket reveal" style="--c:${colorOf(ca)}">
      <div class="ticket-main">
        <small>Final · ${esc(c.place.split(", ").pop())}</small>
        <div class="ticket-teams"><img src="${LOGO(ca)}" alt="" /><span class="vs">${esc(c.score)}</span><img src="${LOGO(ra)}" alt="" /></div>
        <h3>${esc(c.champ)}</h3>
        <p>vs ${esc(c.runner)} · MVP: <strong>${esc(c.mvp)}</strong></p>
        <p>${esc(c.note)}</p>
      </div>
      <div class="ticket-stub"><span>${c.year}</span></div>
    </article>`;
  }).join("");
}

async function renderCupGames() {
  const el = $("#cup-games");
  skeleton(el, 3);
  try {
    const games = (await Api.scoreboard(new Date("2026-10-30T12:00:00"), new Date("2026-12-11T12:00:00"))).filter((g) => /cup/i.test(g.note));
    games.length
      ? (el.innerHTML = games.map(gameCard).join(""))
      : empty(el, "Los partidos de la Copa aparecerán aquí en cuanto ESPN los publique (desde el 30 de octubre).");
  } catch {
    empty(el, "No se pudieron cargar los partidos de la Copa.");
  }
}

// ---------- Campeones ----------
const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
};

function renderRafters() {
  const byTeam = {};
  FINALS.forEach((f) => {
    const a = FRANCHISE[f.champ];
    if (a) (byTeam[a] ||= []).push(f.year);
  });
  const rows = Object.entries(byTeam).sort((a, b) => b[1].length - a[1].length || a[1][0] - b[1][0]);
  $("#rafters").innerHTML = rows
    .map(([abbr, years], i) => {
      const t = teamByAbbr(abbr);
      return `<div class="banner ${isLight(t.color) ? "light" : ""}" style="--c:${t.color};--a:${t.alt};--i:${i}" title="${esc(t.name)}">
        <img src="${LOGO(abbr)}" alt="" loading="lazy" />
        <span class="b-count">${years.length}</span>
        <span class="b-label">${years.length === 1 ? "Campeonato" : "Campeonatos"}</span>
        <span class="b-years">${years.map((y) => `<span>${String(y).slice(2)}'</span>`).join("")}</span>
        <span class="b-name">${esc(t.name.split(" ").pop())}</span>
      </div>`;
    })
    .join("");
}

function renderFinals() {
  const q = $("#champ-search").value.trim().toLowerCase();
  const dec = $("#champ-decade").value;
  const rows = FINALS.filter((f) => {
    const hay = `${f.year} ${f.champ} ${f.runner} ${f.mvp ?? ""}`.toLowerCase();
    return (!q || hay.includes(q)) && (dec === "all" || String(f.year).startsWith(dec.slice(0, 3)));
  }).reverse();
  const logo = (name) => (FRANCHISE[name] ? `<img src="${LOGO(FRANCHISE[name])}" alt="" loading="lazy" />` : `<span class="nologo">—</span>`);
  $("#finals-table tbody").innerHTML =
    rows
      .map(
        (f) => `<tr>
        <td class="year-cell">${f.year}</td>
        <td><span class="team-cell">${logo(f.champ)}<strong>${esc(f.champ)}</strong></span></td>
        <td><span class="series">${esc(f.result)}</span></td>
        <td><span class="team-cell muted">${logo(f.runner)}${esc(f.runner)}</span></td>
        <td>${esc(f.mvp ?? "—")}</td>
      </tr>`
      )
      .join("") || `<tr><td colspan="5" class="muted">Sin resultados.</td></tr>`;
}

function initChampions() {
  const decades = [...new Set(FINALS.map((f) => Math.floor(f.year / 10) * 10))].reverse();
  $("#champ-decade").innerHTML =
    `<option value="all">Todas las décadas</option>` + decades.map((d) => `<option value="${d}">Años ${d}</option>`).join("");
  $("#champ-search").addEventListener("input", renderFinals);
  $("#champ-decade").addEventListener("change", renderFinals);
  renderRafters();
  renderFinals();
}

// ---------- Historia: MVP, Draft y dorsales retirados ----------
function renderHistoryExtras() {
  const teamAbbr = (name) => {
    const t = TEAMS.find((x) => x.name === name) ?? TEAMS.find((x) => FRANCHISE[name] === x.abbr);
    return t?.abbr ?? FRANCHISE[name] ?? ({ "Cincinnati Royals": "sac", "Buffalo Braves": "lac", "New Jersey Nets": "bkn", "New Orleans Hornets": "no", "Charlotte Hornets": "cha", "Philadelphia Warriors": "gs", "Baltimore Bullets": "wsh" })[name] ?? null;
  };
  const logo = (name) => { const a = teamAbbr(name); return a ? `<img src="${LOGO(a)}" alt="" loading="lazy" />` : `<span class="nologo">—</span>`; };
  // Más MVP
  const counts = {};
  MVPS.forEach((m) => (counts[m.player] = (counts[m.player] || 0) + 1));
  $("#mvp-tops").innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([p, n]) => `<div class="mvp-top"><b>${n}</b><span>${esc(p)}</span></div>`).join("");
  $("#mvp-table tbody").innerHTML = MVPS.slice().reverse().map((m) => `<tr>
    <td class="year-cell">${m.year - 1}-${String(m.year).slice(2)}</td>
    <td><strong>${esc(m.player)}</strong></td>
    <td><span class="team-cell">${logo(m.team)}${esc(m.team)}</span></td></tr>`).join("");
  $("#draft-grid").innerHTML = DRAFT_TOP.slice().reverse().map((d) => `
    <div class="draft-card"><span class="d-year">${d.year}</span>${logo(d.team)}<div><strong>${esc(d.player)}</strong><small>${esc(d.team)}</small></div></div>`).join("");
  $("#retired").innerHTML = RETIRED.map((r) => {
    const t = r.abbr ? teamByAbbr(r.abbr) : null;
    return `<div class="banner retired-banner ${t && isLight(t.color) ? "light" : ""}" style="--c:${t?.color ?? "#1d428a"};--a:${t?.alt ?? "#c9082a"};--i:${Math.random() * 6}">
      ${r.abbr ? `<img src="${LOGO(r.abbr)}" alt="" loading="lazy" />` : `<span class="nba-mark">NBA</span>`}
      <span class="b-count">${esc(r.num)}</span>
      <span class="b-label">${esc(r.player)}</span>
      <span class="b-name">${esc(r.note ?? r.team)}</span>
    </div>`;
  }).join("");
}

// ---------- Historia ----------
function initHistory() {
  const el = $("#timeline");
  el.innerHTML = HISTORY.map(
    (h) => `
    <div class="htl-item">
      <div class="htl-card">
        <span class="htl-year" aria-hidden="true">${h.year}</span>
        <div class="y">${h.year}</div>
        <h3>${esc(h.title)}</h3>
        <p>${esc(h.text)}</p>
      </div>
    </div>`
  ).join("");

  const bar = $("#htl-bar");
  const update = () => (bar.style.width = `${((el.scrollLeft + el.clientWidth) / el.scrollWidth) * 100}%`);
  el.addEventListener("scroll", update, { passive: true });
  $$(".htl-arrow").forEach((b) =>
    b.addEventListener("click", () => el.scrollBy({ left: (b.classList.contains("left") ? -1 : 1) * el.clientWidth * 0.8, behavior: "smooth" }))
  );

  // Arrastrar con el ratón
  let down = false, startX = 0, startLeft = 0;
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    down = true; startX = e.clientX; startLeft = el.scrollLeft;
    el.classList.add("dragging");
  });
  window.addEventListener("pointermove", (e) => down && (el.scrollLeft = startLeft - (e.clientX - startX)));
  window.addEventListener("pointerup", () => { down = false; el.classList.remove("dragging"); });
  requestAnimationFrame(update);
}

// ---------- Equipos ----------
const nickname = (t) => (t.name.endsWith("Trail Blazers") ? "Trail Blazers" : t.name.split(" ").pop());
function renderTeams(conf = "all") {
  $("#teams").innerHTML = TEAMS.filter((t) => conf === "all" || t.conf === conf)
    .map(
      (t) => `
    <div class="team-card" role="button" tabindex="0" data-abbr="${t.abbr}" style="--c:${t.color};--a:${t.alt}" aria-label="${esc(t.name)}">
      ${starBtn(t.abbr)}
      <img class="wm" src="${LOGO(t.abbr)}" alt="" loading="lazy" />
      <img class="logo" src="${LOGO(t.abbr)}" alt="" loading="lazy" />
      ${t.titles ? `<span class="rings">${t.titles} 🏆</span>` : ""}
      <span class="city">${esc(t.city)}</span>
      <strong>${esc(nickname(t))}</strong>
      <span class="meta">${t.conf} · ${t.div}</span>
    </div>`
    )
    .join("");
}

async function openTeam(abbr) {
  const t = teamByAbbr(abbr);
  const modal = $("#team-modal");
  const body = $("#team-modal-body");
  const finals = FINALS.filter((f) => FRANCHISE[f.champ] === abbr).map((f) => f.year);
  body.innerHTML = `
    <div class="modal-hero" style="--c:${t.color};--a:${t.alt}">
      <img class="wm" src="${LOGO(abbr)}" alt="" />
      <img src="${LOGO(abbr, true)}" alt="" onerror="this.src='${LOGO(abbr)}'" />
      <div>
        <h2>${esc(t.name)}</h2>
        <p>${esc(t.city)} · Conferencia ${t.conf} · División ${t.div}</p>
        ${starBtn(abbr, "big")}
        <p id="team-live"></p>
      </div>
    </div>
    <div class="modal-body">
      <div class="facts">
        <div><small>Fundación</small><strong>${t.founded}</strong></div>
        <div><small>Pabellón</small><strong>${esc(t.arena)}</strong></div>
        <div><small>Anillos</small><strong>${t.titles}</strong></div>
        <div><small>Conferencia</small><strong>${t.conf}</strong></div>
      </div>
      ${finals.length ? `<div class="years-row">${finals.map((y) => `<span>🏆 ${y}</span>`).join("")}</div>` : `<p class="muted">Todavía sin anillos de la NBA.</p>`}
      <h3>Plantilla</h3>
      <div id="team-roster" class="player-grid small"></div>
    </div>`;
  modal.showModal();

  Api.team(t.espn)
    .then((info) => {
      const rec = info.record?.items?.[0]?.summary;
      $("#team-live").textContent = [rec && `Balance: ${rec}`, info.standingSummary].filter(Boolean).join(" · ");
    })
    .catch(() => {});
  const r = $("#team-roster");
  skeleton(r, 8, 200);
  try {
    const players = await Api.roster(t.espn);
    r.innerHTML = players.map((p) => playerCard(p, t.color)).join("");
  } catch {
    empty(r, "No se pudo cargar la plantilla.");
  }
}

function initTeams() {
  renderTeams();
  $("#team-filter").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $$("#team-filter button").forEach((c) => c.classList.toggle("active", c === b));
    renderTeams(b.dataset.conf);
  });
  const grid = $("#teams");
  grid.addEventListener("click", (e) => {
    if (e.target.closest("[data-fav]")) return;
    const c = e.target.closest(".team-card");
    if (c) location.hash = `#equipo/${c.dataset.abbr}`;
  });
  grid.addEventListener("keydown", (e) => {
    const c = e.target.closest(".team-card");
    if (c && e.target === c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); location.hash = `#equipo/${c.dataset.abbr}`; }
  });
  if (!REDUCED) {
    grid.addEventListener("pointermove", (e) => {
      const c = e.target.closest(".team-card");
      if (!c || e.pointerType !== "mouse") return;
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      c.style.setProperty("--ry", `${(x - 0.5) * 14}deg`);
      c.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
      c.style.setProperty("--mx", `${x * 100}%`);
      c.style.setProperty("--my", `${y * 100}%`);
    });
    grid.addEventListener("pointerout", (e) => {
      const c = e.target.closest(".team-card");
      if (c && !c.contains(e.relatedTarget)) { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); }
    });
  }
  const modal = $("#team-modal");
  $(".close", modal).addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => e.target === modal && modal.close());
}

// ---------- Jugadores ----------
const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='38' r='18' fill='%23ffffff22'/%3E%3Cpath d='M18 100c0-22 14-36 32-36s32 14 32 36' fill='%23ffffff22'/%3E%3C/svg%3E";

function playerCard(p, color) {
  const meta = [p.height, p.weight, p.age && p.age + " años"].filter(Boolean).join(" · ");
  return `
    <a class="player" href="#jugador/${esc(p.id)}" style="--c:${color}">
      ${p.jersey ? `<span class="num">${esc(p.jersey)}</span>` : ""}
      <div class="photo"><img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" onerror="this.onerror=null;this.src=PLACEHOLDER" /></div>
      <div class="info">
        <strong>${esc(p.name)}</strong>
        ${p.pos ? `<span class="pos">${esc(p.pos)}</span>` : ""}
        ${meta ? `<small>${esc(meta)}</small>` : ""}
        ${p.college || p.country ? `<small>${esc(p.college || p.country)}</small>` : ""}
      </div>
    </a>`;
}

let rosterTeam = "ny";
let rosterCache = [];
function filterRoster() {
  const q = $("#roster-search").value.trim().toLowerCase();
  const list = rosterCache.filter((p) => !q || `${p.name} ${p.pos}`.toLowerCase().includes(q));
  const color = colorOf(rosterTeam);
  list.length ? ($("#roster").innerHTML = list.map((p) => playerCard(p, color)).join("")) : empty($("#roster"), "Sin jugadores que coincidan.");
}

async function loadRoster() {
  const t = teamByAbbr(rosterTeam);
  $$("#team-picker button").forEach((b) => b.classList.toggle("active", b.dataset.abbr === rosterTeam));
  $("#roster-head").innerHTML = `<img src="${LOGO(t.abbr)}" alt="" /><div><strong>${esc(t.name)}</strong><br /><span>${t.conf} · ${t.div} · ${esc(t.arena)}</span></div>`;
  skeleton($("#roster"), 10, 240);
  try {
    rosterCache = await Api.roster(t.espn);
    filterRoster();
  } catch {
    empty($("#roster"), "No se pudo cargar la plantilla desde ESPN.");
  }
}

function initPlayers() {
  $("#team-picker").innerHTML = TEAMS.map(
    (t) => `<button data-abbr="${t.abbr}" style="--c:${t.color}" title="${esc(t.name)}" aria-label="${esc(t.name)}"><img src="${LOGO(t.abbr)}" alt="" loading="lazy" /></button>`
  ).join("");
  $("#team-picker").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    rosterTeam = b.dataset.abbr;
    $("#roster-search").value = "";
    loadRoster();
  });
  $("#roster-search").addEventListener("input", filterRoster);

  $("#legends").innerHTML = LEGENDS.map(
    (l) => `
    <article class="legend reveal">
      <span class="jersey" aria-hidden="true">${esc(l.num)}</span>
      <span class="pos">${esc(l.pos)} · ${esc(l.years)}</span>
      <h3>${esc(l.name)}</h3>
      <span class="teams">${esc(l.teams)}</span>
      <p>${esc(l.fact)}</p>
      <div class="ring-row" aria-label="${l.rings} anillos">${'<span class="ring"></span>'.repeat(l.rings)}<b>${l.rings} ${l.rings === 1 ? "anillo" : "anillos"}</b></div>
    </article>`
  ).join("");
}

// ---------- Récords ----------
function renderRecords() {
  $("#records").innerHTML = RECORDS.map(
    (r) => `<div class="record reveal"><span class="big" data-count="${/^[\d.]+$/.test(r.stat) ? r.stat.replace(/\./g, "") : ""}">${esc(r.stat)}</span><strong>${esc(r.label)}</strong><small>${esc(r.who)}</small></div>`
  ).join("");
}

function countUp(el) {
  const target = +el.dataset.count;
  if (!target || REDUCED) return;
  const t0 = performance.now(), dur = 1400;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("es-ES");
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- Trivia con reloj de posesión ----------
const SHOT = 24;
const quiz = { order: [], i: 0, score: 0, timer: null, left: SHOT, best: 0 };
try { quiz.best = +localStorage.getItem("nbahub-best") || 0; } catch {}

function startQuiz() {
  quiz.order = [...TRIVIA].sort(() => Math.random() - 0.5).slice(0, 8);
  quiz.i = 0;
  quiz.score = 0;
  renderQuestion();
}

function quizShell(inner, clock = SHOT) {
  $("#quiz").innerHTML = `
    <div class="shot-clock">
      <small>Reloj de posesión</small>
      <span class="clock ${clock > 5 ? "ok" : ""}" id="clock">${String(clock).padStart(2, "0")}</span>
      <div class="sc-score"><div><small>Aciertos</small><b>${quiz.score}</b></div><div><small>Récord</small><b>${quiz.best}</b></div></div>
    </div>
    <div class="quiz-card">${inner}</div>`;
}

function renderQuestion() {
  clearInterval(quiz.timer);
  const n = quiz.order.length;
  if (quiz.i >= n) {
    if (quiz.score > quiz.best) { quiz.best = quiz.score; try { localStorage.setItem("nbahub-best", quiz.best); } catch {} }
    const msg = quiz.score === n ? "¡Hall of Famer! Pleno absoluto." : quiz.score >= n * 0.75 ? "Nivel All-Star. Muy bien jugado." : quiz.score >= n / 2 ? "Titular en la rotación. ¡No está mal!" : "Toca repasar la sección de Historia.";
    quizShell(`<div class="quiz-end"><div class="big">${quiz.score}/${n}</div><h3>${msg}</h3><button class="btn primary" id="quiz-restart">Jugar otra vez</button></div>`, 0);
    $("#quiz-restart").addEventListener("click", startQuiz);
    return;
  }
  const q = quiz.order[quiz.i];
  quizShell(`
    <span class="q-n">Pregunta ${quiz.i + 1} de ${n}</span>
    <h3>${esc(q.q)}</h3>
    <div class="q-bar"><span style="width:${(quiz.i / n) * 100}%"></span></div>
    <div class="answers">${q.a.map((a, i) => `<button class="answer" data-i="${i}"><kbd>${"ABCD"[i]}</kbd>${esc(a)}</button>`).join("")}</div>`);

  const answer = (chosen) => {
    clearInterval(quiz.timer);
    const btns = $$(".answer");
    if (chosen === q.c) quiz.score++;
    btns.forEach((x, i) => { x.disabled = true; if (i === q.c) x.classList.add("right"); });
    if (chosen !== q.c && chosen >= 0) btns[chosen].classList.add("wrong");
    setTimeout(() => { quiz.i++; renderQuestion(); }, 1200);
  };
  $$(".answer").forEach((b) => b.addEventListener("click", () => answer(+b.dataset.i)));

  quiz.left = SHOT;
  quiz.timer = setInterval(() => {
    quiz.left--;
    const c = $("#clock");
    if (!c) return clearInterval(quiz.timer);
    c.textContent = String(Math.max(0, quiz.left)).padStart(2, "0");
    c.classList.toggle("ok", quiz.left > 5);
    if (quiz.left <= 0) answer(-1);
  }, 1000);
}

// ---------- Animaciones al hacer scroll ----------
const io = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      $$("[data-count]", e.target).forEach(countUp);
      io.unobserve(e.target);
    }), { threshold: 0.15 })
  : null;
const observeReveals = () => $$(".view.active .reveal:not(.in)").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));

// ---------- Router ----------
const loaded = new Set();
const lazyLoaders = {
  inicio: renderUpcoming,
  calendario: renderDay,
  clasificacion: () => { renderStandings(); renderSeasonRecords(); },
  nbacup: () => { renderCupGames(); renderCupGroups(); },
  jugadores: () => { loadRoster(); renderMvpRace(); Players.renderLeaders(); Players.initCompare(); },
};

let prevView = null;
function route() {
  const hash = decodeURIComponent((location.hash || "#inicio").slice(1));
  const [id, param, extra] = hash.split("/");
  const view = document.getElementById(id)?.classList.contains("view") ? id : "inicio";
  const navKey = view === "partido" ? "calendario" : view === "jugador" ? "jugadores" : view === "equipo" ? "equipos" : view === "multi" ? "hoy" : view;
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === view));
  $$(".nav a").forEach((a) => {
    const on = a.getAttribute("href") === "#" + navKey;
    a.classList.toggle("active", on);
    on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  });
  if (view === "partido" && param) {
    $("#match-back").href = prevView && prevView !== "partido" ? "#" + prevView : "#calendario";
    Game.open(param);
  } else Game.stop();
  if (view === "jugador" && param) Players.open(param);
  if (view === "extras") {
    Porra.open();
    if (!Guess.pool) Guess.init();
    if (param === "liga" && extra) { Porra.addFriend(extra); history.replaceState(null, "", "#extras"); }
  }
  if (view === "hoy") Tonight.open(); else Tonight.stop();
  if (view === "multi") Multi.open(); else Multi.stop();
  if (view === "equipo" && param) TeamPage.open(param);
  if (view === "noticias") News.visited();
  prevView = view;
  $(".nav").classList.remove("open");
  $(".menu-btn").setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
  if (view !== "extras") clearInterval(quiz.timer);
  else if (!$("#quiz").children.length || quiz.i >= quiz.order.length) startQuiz();
  else renderQuestion();
  if (lazyLoaders[view] && !loaded.has(view)) {
    loaded.add(view);
    lazyLoaders[view]();
  }
  window.scrollTo({ top: 0 });
  requestAnimationFrame(observeReveals);
}

document.addEventListener("DOMContentLoaded", () => {
  fillTicker();
  renderMyTeams();
  renderCountdown();
  renderLogoWall();
  initCalendar();
  renderCup();
  initChampions();
  initHistory();
  initTeams();
  initPlayers();
  renderRecords();

  $(".menu-btn").addEventListener("click", (e) => {
    const open = $(".nav").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  });
  // Tema claro / oscuro
  $("#theme-btn").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme !== "light";
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("nbahub-theme", root.dataset.theme); } catch {}
  });

  // Instalar como app (Android / escritorio) y service worker para que abra sin conexión
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("#install-btn").hidden = false; });
  $("#install-btn").addEventListener("click", async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    installEvt = null;
    $("#install-btn").hidden = true;
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

  // Contador de visitas sin cookies (GoatCounter). Se activa poniendo aquí el código de tu cuenta,
  // p. ej. "nbahub" para https://nbahub.goatcounter.com
  const GOATCOUNTER = "";
  if (GOATCOUNTER && location.protocol === "https:") {
    const sc = document.createElement("script");
    sc.async = true;
    sc.src = "https://gc.zgo.at/count.js";
    sc.dataset.goatcounter = `https://${GOATCOUNTER}.goatcounter.com/count`;
    sc.dataset.goatcounterSettings = JSON.stringify({ no_onload: true });
    sc.onload = () => window.goatcounter?.count?.({ path: location.pathname + (location.hash.split("/")[0] || "#inicio") });
    document.head.appendChild(sc);
    window.addEventListener("hashchange", () => window.goatcounter?.count?.({ path: location.pathname + location.hash.split("/")[0] }));
  }

  // Enlace "Saltar al contenido" sin romper la navegación por #
  $(".skip-link").addEventListener("click", (e) => { e.preventDefault(); $("#main").focus(); });

  // Aviso discreto cuando se usan los datos de respaldo
  document.addEventListener("datasource", async (e) => {
    const pill = $("#src-pill");
    if (e.detail !== "copia") return (pill.hidden = true);
    pill.hidden = false;
    try {
      const m = await Api.meta();
      pill.textContent = `Datos de respaldo · actualizados ${timeAgo(new Date(m.updated))}`;
    } catch { pill.textContent = "Datos de respaldo"; }
  });

  // Estrellas de "Mis equipos" en cualquier parte de la página
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-fav]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    Favs.toggle(b.dataset.fav);
  }, true);
  document.addEventListener("favs", () => { renderMyTeams(); if (dayGames.length) paintDay(); News.renderList?.(); });
  window.addEventListener("hashchange", route);
  Videos.init();
  Search.init();
  CloseAlerts.init();
  renderHistoryExtras();
  News.init();
  route();

  // Marcadores en directo: refresco automático cada 30 s en Inicio y Partidos
  setInterval(() => {
    if (document.hidden) return;
    const v = $(".view.active")?.id;
    if (v === "inicio") renderUpcoming(true);
    if (v === "calendario" && (dayGames.some((g) => g.state === "in") || sameDay(currentDay, new Date()))) renderDay(true);
  }, 30000);
});
