// ---------- Ficha completa de equipo: calendario, resultados, líderes, bajas y plantilla ----------
const TeamPage = {
  async open(abbr) {
    const t = teamByAbbr(abbr);
    const el = $("#team-page");
    if (!t) return empty(el, "Equipo no encontrado.");
    const finals = FINALS.filter((f) => FRANCHISE[f.champ] === abbr).map((f) => f.year);
    el.innerHTML = `
      <div class="p-hero team-hero" style="--c:${t.color};--a:${t.alt}">
        <img class="wm" src="${LOGO(abbr)}" alt="" />
        <div class="p-photo"><img src="${LOGO(abbr, true)}" alt="" onerror="this.src='${LOGO(abbr)}'" /></div>
        <div class="p-info">
          <span class="p-team">${esc(t.city)} · Conferencia ${t.conf} · División ${t.div}</span>
          <h2>${esc(t.name)}</h2>
          <p id="tp-record">${t.titles ? `${t.titles} ${t.titles === 1 ? "anillo" : "anillos"} · ` : ""}Fundado en ${t.founded} · ${esc(t.arena)}</p>
          <div class="p-actions">
            ${starBtn(abbr, "big")}
            <button class="btn primary" id="tp-ics">📅 Añadir sus partidos a mi calendario</button>
          </div>
        </div>
      </div>
      ${finals.length ? `<div class="years-row big">${finals.map((y) => `<span>🏆 ${y}</span>`).join("")}</div>` : ""}
      <div class="tp-grid">
        <div class="card-block" id="tp-next"><div class="skel" style="height:120px"></div></div>
        <div class="card-block" id="tp-leaders"><div class="skel" style="height:120px"></div></div>
      </div>
      <div class="section-head"><div><p class="kicker">Temporada 2026-27</p><h2>Calendario</h2></div><span class="muted" id="tp-cal-sum"></span></div>
      <div id="tp-schedule" class="card-block"><div class="skel" style="height:300px"></div></div>
      <div class="section-head"><div><p class="kicker">Parte médico</p><h2>Bajas</h2></div></div>
      <div id="tp-injuries"></div>
      <div class="section-head"><div><p class="kicker">Plantilla</p><h2>Jugadores</h2></div></div>
      <div id="tp-roster" class="player-grid"></div>`;

    this.events = [];
    $("#tp-ics").addEventListener("click", () => this.downloadIcs(t));
    this.loadSchedule(t);
    this.loadLeaders(t);
    this.loadInjuries(t);
    this.loadRoster(t);
    this.loadRecord(t);
  },

  // Normaliza un partido del calendario del equipo
  parse(e, abbr) {
    const c = e.competitions?.[0] ?? {};
    const me = c.competitors?.find((x) => (x.team?.abbreviation ?? "").toLowerCase() === abbr) ?? {};
    const op = c.competitors?.find((x) => x !== me) ?? {};
    const score = (x) => x.score?.displayValue ?? x.score?.value ?? (typeof x.score === "string" ? x.score : "");
    const st = c.status?.type ?? {};
    return {
      id: e.id, date: new Date(e.date), home: me.homeAway === "home",
      opp: { abbr: (op.team?.abbreviation ?? "").toLowerCase(), name: op.team?.shortDisplayName ?? op.team?.displayName ?? "", logo: safeUrl(op.team?.logo ?? op.team?.logos?.[0]?.href) },
      done: st.completed, state: st.state, my: score(me), their: score(op), win: me.winner,
      tv: (c.broadcasts ?? []).map((b) => b.media?.shortName).filter(Boolean).join(", "),
    };
  },

  async loadSchedule(t) {
    const el = $("#tp-schedule");
    try {
      const raw = await Api.teamSchedule(t.espn, 2);
      this.events = raw.map((e) => this.parse(e, t.abbr)).sort((a, b) => a.date - b.date);
    } catch {
      this.events = [];
    }
    if (!this.events.length) {
      empty(el, "No se pudo cargar el calendario del equipo.");
      $("#tp-next").innerHTML = `<h3>Próximo partido</h3><p class="muted">Sin datos.</p>`;
      return;
    }
    const done = this.events.filter((e) => e.done);
    const w = done.filter((e) => e.win).length;
    $("#tp-cal-sum").textContent = `${this.events.length} partidos · ${w}-${done.length - w}`;

    // Próximo y último
    const next = this.events.find((e) => !e.done);
    const last = done.at(-1);
    const gameLine = (e, label) => e ? `
      <a class="my-game" href="#partido/${esc(e.id)}"><small>${label}</small>
        <span>${e.home ? "vs" : "@"} <img src="${esc(e.opp.logo || LOGO(e.opp.abbr))}" alt="" /> ${esc(e.opp.name)}</span>
        <b>${e.done ? `${e.win ? "V" : "D"} ${esc(e.my)}-${esc(e.their)}` : e.state === "in" ? `<span class="live">EN VIVO</span>` : `${fmtDate(e.date)} · ${fmtTime(e.date)}`}</b></a>` : "";
    const form = done.slice(-5).map((e) => `<span class="form ${e.win ? "w" : "l"}">${e.win ? "V" : "D"}</span>`).join("");
    $("#tp-next").innerHTML = `<h3>Partidos</h3>${gameLine(next, "Próximo partido")}${gameLine(last, "Último resultado")}${form ? `<div class="form-row"><small>Últimos 5</small>${form}</div>` : ""}`;

    // Calendario por meses
    const byMonth = new Map();
    this.events.forEach((e) => {
      const k = e.date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(e);
    });
    el.innerHTML = [...byMonth].map(([m, list]) => `
      <h4 class="cal-month">${esc(m)}</h4>
      ${list.map((e) => `
        <div class="cal-row ${e.done ? (e.win ? "w" : "l") : ""}">
          <span class="cal-date">${e.date.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" })}</span>
          <a class="cal-opp" href="#partido/${esc(e.id)}">${e.home ? "vs" : "@"} <img src="${esc(e.opp.logo || LOGO(e.opp.abbr))}" alt="" loading="lazy" /> ${esc(e.opp.name)}</a>
          <span class="cal-res">${e.done ? `<b>${e.win ? "V" : "D"}</b> ${esc(e.my)}-${esc(e.their)}` : e.state === "in" ? `<span class="live">EN VIVO</span>` : fmtTime(e.date)}</span>
          ${!e.done && e.state !== "in" ? `<a class="cal-add" href="${this.googleLink(t, e)}" target="_blank" rel="noopener" title="Añadir a Google Calendar">+ Calendar</a>` : `<span></span>`}
        </div>`).join("")}`).join("");
  },

  title(t, e) { return `🏀 ${e.home ? `${e.opp.name} @ ${nickname(t)}` : `${nickname(t)} @ ${e.opp.name}`}`; },
  utc(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); },

  googleLink(t, e) {
    const end = new Date(+e.date + 2.5 * 3600e3);
    const q = new URLSearchParams({
      action: "TEMPLATE", text: this.title(t, e), dates: `${this.utc(e.date)}/${this.utc(end)}`,
      details: `Sigue el partido en NBA Hub: https://ikerrmansso69.github.io/nba-hub/#partido/${e.id}`,
    });
    return `https://calendar.google.com/calendar/render?${q}`;
  },

  // Fichero .ics con todos los partidos pendientes (Google Calendar, iPhone, Outlook…)
  downloadIcs(t) {
    const pending = this.events.filter((e) => !e.done);
    if (!pending.length) return toast("Todavía no se ha cargado el calendario. Inténtalo en unos segundos.");
    const esc2 = (s) => String(s).replace(/[\\;,]/g, (c) => "\\" + c);
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NBA Hub//ES", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc2(t.name)} · NBA Hub`];
    pending.forEach((e) => {
      lines.push("BEGIN:VEVENT", `UID:${e.id}-${t.abbr}@nbahub`, `DTSTAMP:${this.utc(new Date())}`,
        `DTSTART:${this.utc(e.date)}`, `DTEND:${this.utc(new Date(+e.date + 2.5 * 3600e3))}`,
        `SUMMARY:${esc2(this.title(t, e))}`, `DESCRIPTION:${esc2(`En directo en NBA Hub: https://ikerrmansso69.github.io/nba-hub/#partido/${e.id}`)}`,
        `URL:https://ikerrmansso69.github.io/nba-hub/#partido/${e.id}`,
        "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${esc2(this.title(t, e))} empieza en 30 minutos`, "END:VALARM",
        "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${t.abbr}-nba-2026-27.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`📅 ${pending.length} partidos listos. Abre el archivo para añadirlos a tu calendario (con aviso 30 min antes).`);
  },

  async loadRecord(t) {
    try {
      const confs = await Api.standings();
      for (const c of confs) {
        const i = c.teams.findIndex((x) => x.abbr === t.abbr);
        if (i >= 0) {
          const x = c.teams[i];
          $("#tp-record").innerHTML = `<b>${x.wins}-${x.losses}</b> · ${i + 1}º en el ${/east/i.test(c.name) ? "Este" : "Oeste"} · ${t.titles ? `${t.titles} ${t.titles === 1 ? "anillo" : "anillos"} · ` : ""}${esc(t.arena)}`;
        }
      }
    } catch {}
  },

  async loadLeaders(t) {
    const el = $("#tp-leaders");
    await Players.load();
    const mine = (Players.data?.players ?? []).filter((p) => String(p.team).toLowerCase() === t.abbr && (p.s.gamesPlayed ?? 0) > 0);
    if (!mine.length) return (el.innerHTML = `<h3>Líderes</h3><p class="muted">Sin estadísticas todavía.</p>`);
    const cat = [["avgPoints", "Puntos"], ["avgRebounds", "Rebotes"], ["avgAssists", "Asistencias"]];
    el.innerHTML = `<h3>Líderes · ${esc(Players.data.season)}</h3>` + cat.map(([k, l]) => {
      const p = mine.slice().sort((a, b) => (b.s[k] ?? 0) - (a.s[k] ?? 0))[0];
      return `<a class="leader" href="#jugador/${esc(p.id)}"><img src="${esc(safeUrl(p.photo) || PLACEHOLDER)}" alt="" onerror="this.src=PLACEHOLDER" />
        <div><small>${l}</small><strong>${esc(p.name)}</strong><span>${fmtStat(p.s[k])} por partido</span></div></a>`;
    }).join("");
  },

  async loadInjuries(t) {
    const el = $("#tp-injuries");
    try {
      const all = await Api.injuries();
      const list = all.find((x) => x.teamId === String(t.espn))?.list ?? [];
      el.innerHTML = list.length
        ? `<div class="inj-team" style="--c:${t.color}">${list.map((p) => `
            <div class="inj-row">
              <div class="inj-photo">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}</div>
              <div class="inj-info"><strong>${esc(p.name)} <small>${esc(p.pos)}</small></strong><span>${esc(p.comment || p.detail)}</span></div>
              <span class="status ${/out/i.test(p.status) ? "out" : "dtd"}">${esc(({ Out: "Baja", "Day-To-Day": "Día a día" })[p.status] ?? p.status)}</span>
            </div>`).join("")}</div>`
        : `<p class="muted">Sin bajas comunicadas. 💪</p>`;
    } catch {
      empty(el, "No se pudo cargar el parte de lesiones.");
    }
  },

  async loadRoster(t) {
    const el = $("#tp-roster");
    skeleton(el, 8, 240);
    try {
      const players = await Api.roster(t.espn);
      el.innerHTML = players.map((p) => playerCard(p, t.color)).join("");
    } catch {
      empty(el, "No se pudo cargar la plantilla.");
    }
  },
};
