// ---------- Utilidades ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const teamByAbbr = (abbr) => TEAMS.find((t) => t.abbr === abbr);
const SEASON_START = new Date("2026-10-20T00:00:00");

const fmtDate = (d) => d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (d) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const loading = (el, msg = "Cargando…") => (el.innerHTML = `<p class="muted loading">${msg}</p>`);
const empty = (el, msg) => (el.innerHTML = `<p class="muted">${msg}</p>`);

const SEASON_LABEL = { 1: "Pretemporada", 2: "Temporada regular", 3: "Playoffs", 5: "Play-in" };

function gameCard(g) {
  const side = (t, isWinner) => `
    <div class="g-team ${isWinner ? "win" : ""}">
      <img src="${esc(t.logo || LOGO(t.abbr))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
      <div class="g-name"><strong>${esc(t.short || t.name)}</strong><small>${esc(t.record)}</small></div>
      <span class="g-score">${g.state === "pre" ? "" : esc(t.score)}</span>
    </div>`;
  const status =
    g.state === "pre"
      ? g.noTime ? fmtDate(g.date) : `${fmtDate(g.date)} · ${fmtTime(g.date)}`
      : g.state === "in"
      ? `<span class="live">● EN VIVO</span> ${esc(g.detail)}`
      : `Final · ${fmtDate(g.date)}`;
  const tag = g.note || SEASON_LABEL[g.seasonType] || "";
  return `
    <article class="game">
      <div class="g-head"><span>${status}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>
      ${side(g.away, g.away.winner)}
      ${side(g.home, g.home.winner)}
      <div class="g-foot">${esc([g.venue, g.tv].filter(Boolean).join(" · "))}</div>
    </article>`;
}

function fallbackGames() {
  return FALLBACK_GAMES.map((f) => {
    const t = (abbr) => {
      const team = teamByAbbr(abbr);
      return { abbr, name: team.name, short: team.name.split(" ").pop(), logo: LOGO(abbr), record: "" };
    };
    return { date: new Date(f.date + "T12:00:00"), noTime: true, state: "pre", note: f.note, away: t(f.away), home: t(f.home), venue: teamByAbbr(f.home).arena };
  });
}

// ---------- Inicio ----------
function renderCountdown() {
  const el = $("#countdown");
  const days = Math.ceil((SEASON_START - new Date()) / 86400000);
  el.innerHTML =
    days > 0
      ? `<span class="big">${days}</span><span>${days === 1 ? "día" : "días"} para la noche inaugural (20 oct)</span>`
      : `<span class="big">🔥</span><span>La temporada 2026-27 está en marcha</span>`;
}

async function renderUpcoming() {
  const el = $("#upcoming");
  loading(el, "Buscando los próximos partidos…");
  try {
    const now = new Date();
    const to = new Date(now.getTime() + 7 * 86400000);
    let games = (await Api.scoreboard(now, to)).filter((g) => g.state !== "post");
    if (!games.length) throw new Error("sin partidos");
    el.innerHTML = games.slice(0, 15).map(gameCard).join("");
  } catch {
    el.innerHTML =
      `<p class="muted">No se pudo conectar con el calendario en vivo. Partidos destacados de la noche inaugural:</p>` +
      fallbackGames().map(gameCard).join("");
  }
}

// ---------- Calendario ----------
let currentDay = new Date() < SEASON_START ? new Date(SEASON_START) : new Date();

async function renderDay() {
  const el = $("#day-games");
  const picker = $("#day-picker");
  picker.value = ymd(currentDay).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  loading(el);
  try {
    const games = await Api.scoreboard(currentDay);
    games.length ? (el.innerHTML = games.map(gameCard).join("")) : empty(el, "No hay partidos este día.");
  } catch {
    empty(el, "No se pudieron cargar los partidos. Inténtalo de nuevo más tarde.");
  }
}

function initCalendar() {
  $$("#calendario [data-day]").forEach((b) =>
    b.addEventListener("click", () => {
      const step = +b.dataset.day;
      if (step === 0) currentDay = new Date();
      else currentDay = new Date(currentDay.getTime() + step * 86400000);
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
  loading(el);
  try {
    const confs = await Api.standings();
    if (!confs.length) throw new Error();
    el.innerHTML = confs
      .map(
        (c) => `
      <div class="card">
        <h3>${esc(c.name.replace("Eastern Conference", "Conferencia Este").replace("Western Conference", "Conferencia Oeste"))}</h3>
        <table class="table compact">
          <thead><tr><th>#</th><th>Equipo</th><th>V</th><th>D</th><th>%</th><th>DIF</th><th>Racha</th></tr></thead>
          <tbody>${c.teams
            .map(
              (t, i) => `
            <tr class="${i < 6 ? "po" : i < 10 ? "pi" : ""}">
              <td>${i + 1}</td>
              <td class="team-cell"><img src="${esc(t.logo || LOGO(t.abbr))}" alt="" loading="lazy" />${esc(t.name)}</td>
              <td>${t.wins}</td><td>${t.losses}</td><td>${esc(t.pct)}</td><td>${esc(t.gb)}</td><td>${esc(t.streak)}</td>
            </tr>`
            )
            .join("")}</tbody>
        </table>
      </div>`
      )
      .join("");
  } catch {
    empty(el, "No se pudo cargar la clasificación en este momento.");
  }
}

// ---------- NBA Cup ----------
function renderCup() {
  $("#cup-dates").innerHTML = CUP_2026.map((d) => `<div class="pill"><strong>${esc(d.date)}</strong><span>${esc(d.what)}</span></div>`).join("");
  $("#cup-finals").innerHTML = NBA_CUP.map((c) => {
    const ca = FRANCHISE[c.champ], ra = FRANCHISE[c.runner];
    return `
    <div class="card cup-card">
      <div class="cup-year">${c.year}</div>
      <div class="cup-match">
        <div><img src="${LOGO(ca)}" alt="" /><strong>${esc(c.champ)}</strong></div>
        <div class="cup-score">${esc(c.score)}</div>
        <div><img src="${LOGO(ra)}" alt="" /><span>${esc(c.runner)}</span></div>
      </div>
      <p><strong>MVP:</strong> ${esc(c.mvp)} · ${esc(c.place)}</p>
      <p class="muted">${esc(c.note)}</p>
    </div>`;
  }).join("");
}

async function renderCupGames() {
  const el = $("#cup-games");
  loading(el);
  try {
    const games = (await Api.scoreboard(new Date("2026-10-30T12:00:00"), new Date("2026-12-11T12:00:00")))
      .filter((g) => /cup/i.test(g.note));
    games.length
      ? (el.innerHTML = games.map(gameCard).join(""))
      : empty(el, "Los partidos de la Copa aparecerán aquí en cuanto ESPN los publique (desde el 30 de octubre).");
  } catch {
    empty(el, "No se pudieron cargar los partidos de la Copa.");
  }
}

// ---------- Campeones ----------
function renderTitlesChart() {
  const counts = {};
  FINALS.forEach((f) => {
    const a = FRANCHISE[f.champ];
    if (a) counts[a] = (counts[a] || 0) + 1;
  });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = rows[0][1];
  $("#titles-chart").innerHTML =
    `<h3 class="sub">Anillos por franquicia</h3>` +
    rows
      .map(([abbr, n]) => {
        const t = teamByAbbr(abbr);
        return `<div class="bar-row">
          <img src="${LOGO(abbr)}" alt="" loading="lazy" />
          <span class="bar-name">${esc(t.name)}</span>
          <div class="bar"><div style="width:${(n / max) * 100}%;background:${t.color}"></div></div>
          <span class="bar-n">${n}</span>
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
  const logo = (name) => (FRANCHISE[name] ? `<img src="${LOGO(FRANCHISE[name])}" alt="" loading="lazy" />` : `<span class="nologo">🏀</span>`);
  $("#finals-table tbody").innerHTML =
    rows
      .map(
        (f) => `<tr>
        <td><strong>${f.year}</strong></td>
        <td class="team-cell">${logo(f.champ)}${esc(f.champ)}</td>
        <td>${esc(f.result)}</td>
        <td class="team-cell muted">${logo(f.runner)}${esc(f.runner)}</td>
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
  renderTitlesChart();
  renderFinals();
}

// ---------- Historia ----------
function renderHistory() {
  $("#timeline").innerHTML = HISTORY.map(
    (h, i) => `
    <div class="tl-item ${i % 2 ? "right" : "left"}">
      <div class="tl-year">${h.year}</div>
      <div class="card"><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div>
    </div>`
  ).join("");
}

// ---------- Equipos ----------
function renderTeams(conf = "all") {
  $("#teams").innerHTML = TEAMS.filter((t) => conf === "all" || t.conf === conf)
    .map(
      (t) => `
    <button class="team-card" data-abbr="${t.abbr}" style="--c:${t.color};--a:${t.alt}">
      <img src="${LOGO(t.abbr)}" alt="Logo de ${esc(t.name)}" loading="lazy" />
      <strong>${esc(t.name)}</strong>
      <small>${t.conf} · ${t.div}</small>
      ${t.titles ? `<span class="rings">🏆 ${t.titles}</span>` : ""}
    </button>`
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
      <img src="${LOGO(abbr, true)}" alt="" onerror="this.src='${LOGO(abbr)}'" />
      <div>
        <h2>${esc(t.name)}</h2>
        <p>${esc(t.city)} · Conferencia ${t.conf} · División ${t.div}</p>
        <p id="team-live" class="muted"></p>
      </div>
    </div>
    <div class="facts">
      <div><small>Fundación</small><strong>${t.founded}</strong></div>
      <div><small>Pabellón</small><strong>${esc(t.arena)}</strong></div>
      <div><small>Títulos</small><strong>${t.titles}</strong></div>
    </div>
    ${finals.length ? `<p><strong>Años campeón:</strong> ${finals.join(", ")}</p>` : `<p class="muted">Todavía sin anillos de la NBA.</p>`}
    <h3 class="sub">Plantilla</h3>
    <div id="team-roster" class="player-grid small"></div>`;
  modal.showModal();

  Api.team(t.espn)
    .then((info) => {
      const rec = info.record?.items?.[0]?.summary;
      $("#team-live").textContent = [rec && `Balance: ${rec}`, info.standingSummary].filter(Boolean).join(" · ");
    })
    .catch(() => {});
  const r = $("#team-roster");
  loading(r);
  try {
    const players = await Api.roster(t.espn);
    r.innerHTML = players.map(playerCard).join("");
  } catch {
    empty(r, "No se pudo cargar la plantilla.");
  }
}

function initTeams() {
  renderTeams();
  $("#team-filter").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    $$("#team-filter .chip").forEach((c) => c.classList.toggle("active", c === b));
    renderTeams(b.dataset.conf);
  });
  $("#teams").addEventListener("click", (e) => {
    const c = e.target.closest(".team-card");
    if (c) openTeam(c.dataset.abbr);
  });
  const modal = $("#team-modal");
  $(".close", modal).addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => e.target === modal && modal.close());
}

// ---------- Jugadores ----------
function playerCard(p) {
  return `
    <a class="player" href="https://www.espn.com/nba/player/_/id/${esc(p.id)}" target="_blank" rel="noopener">
      <img src="${esc(p.photo)}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 10%22><text y=%227%22 x=%222%22 font-size=%226%22>🏀</text></svg>'" />
      <div>
        <strong>${esc(p.name)}</strong>
        <small>${p.jersey ? "#" + esc(p.jersey) + " · " : ""}${esc(p.pos)}</small>
        <small class="muted">${esc([p.height, p.weight, p.age && p.age + " años"].filter(Boolean).join(" · "))}</small>
        ${p.college || p.country ? `<small class="muted">${esc(p.college || p.country)}</small>` : ""}
      </div>
    </a>`;
}

let rosterCache = [];
function filterRoster() {
  const q = $("#roster-search").value.trim().toLowerCase();
  const list = rosterCache.filter((p) => !q || `${p.name} ${p.pos}`.toLowerCase().includes(q));
  list.length ? ($("#roster").innerHTML = list.map(playerCard).join("")) : empty($("#roster"), "Sin jugadores que coincidan.");
}

async function loadRoster() {
  const t = teamByAbbr($("#roster-team").value);
  loading($("#roster"));
  try {
    rosterCache = await Api.roster(t.espn);
    filterRoster();
  } catch {
    empty($("#roster"), "No se pudo cargar la plantilla desde ESPN.");
  }
}

function initPlayers() {
  const sel = $("#roster-team");
  sel.innerHTML = TEAMS.map((t) => `<option value="${t.abbr}">${esc(t.name)}</option>`).join("");
  sel.value = "ny";
  sel.addEventListener("change", loadRoster);
  $("#roster-search").addEventListener("input", filterRoster);

  $("#legends").innerHTML = LEGENDS.map((l) => {
    const initials = l.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
    return `
    <div class="card legend">
      <div class="avatar">${esc(initials)}</div>
      <div>
        <h3>${esc(l.name)}</h3>
        <small>${esc(l.pos)} · ${esc(l.teams)} · ${esc(l.years)}</small>
        <p>${esc(l.fact)}</p>
        <span class="rings">${"💍".repeat(Math.min(l.rings, 11))} ${l.rings}</span>
      </div>
    </div>`;
  }).join("");
}

// ---------- Récords y trivia ----------
function renderRecords() {
  $("#records").innerHTML = RECORDS.map(
    (r) => `<div class="record card"><span class="big">${esc(r.stat)}</span><strong>${esc(r.label)}</strong><small>${esc(r.who)}</small></div>`
  ).join("");
}

const quiz = { order: [], i: 0, score: 0 };
function startQuiz() {
  quiz.order = [...TRIVIA].sort(() => Math.random() - 0.5).slice(0, 8);
  quiz.i = 0;
  quiz.score = 0;
  renderQuestion();
}
function renderQuestion() {
  const el = $("#quiz");
  if (quiz.i >= quiz.order.length) {
    const n = quiz.order.length;
    const msg = quiz.score === n ? "¡Eres un auténtico Hall of Famer! 🏆" : quiz.score >= n / 2 ? "¡Buen nivel, All-Star! ⭐" : "Toca repasar la sección de Historia 📚";
    el.innerHTML = `<h3>Resultado: ${quiz.score}/${n}</h3><p>${msg}</p><button class="btn" id="quiz-restart">Jugar otra vez</button>`;
    $("#quiz-restart").addEventListener("click", startQuiz);
    return;
  }
  const q = quiz.order[quiz.i];
  el.innerHTML = `
    <div class="quiz-head"><span>Pregunta ${quiz.i + 1} de ${quiz.order.length}</span><span>Aciertos: ${quiz.score}</span></div>
    <h3>${esc(q.q)}</h3>
    <div class="answers">${q.a.map((a, i) => `<button class="answer" data-i="${i}">${esc(a)}</button>`).join("")}</div>`;
  $$(".answer", el).forEach((b) =>
    b.addEventListener("click", () => {
      const ok = +b.dataset.i === q.c;
      if (ok) quiz.score++;
      $$(".answer", el).forEach((x, i) => {
        x.disabled = true;
        if (i === q.c) x.classList.add("right");
      });
      if (!ok) b.classList.add("wrong");
      setTimeout(() => { quiz.i++; renderQuestion(); }, 1100);
    })
  );
}

// ---------- Router ----------
const loaded = new Set();
const lazyLoaders = {
  inicio: renderUpcoming,
  calendario: renderDay,
  clasificacion: renderStandings,
  nbacup: renderCupGames,
  jugadores: loadRoster,
};

function route() {
  const id = (location.hash || "#inicio").slice(1);
  const view = document.getElementById(id) ? id : "inicio";
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === view));
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + view));
  $(".nav").classList.remove("open");
  $(".menu-btn").setAttribute("aria-expanded", "false");
  if (lazyLoaders[view] && !loaded.has(view)) {
    loaded.add(view);
    lazyLoaders[view]();
  }
  window.scrollTo({ top: 0 });
}

document.addEventListener("DOMContentLoaded", () => {
  renderCountdown();
  initCalendar();
  renderCup();
  initChampions();
  renderHistory();
  initTeams();
  initPlayers();
  renderRecords();
  startQuiz();

  $(".menu-btn").addEventListener("click", (e) => {
    const open = $(".nav").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", String(open));
  });
  window.addEventListener("hashchange", route);
  route();
});
