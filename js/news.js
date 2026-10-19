// ---------- Noticias en directo, parte de lesiones y movimientos ----------
const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
function timeAgo(d) {
  const s = Math.round((d - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return "ahora mismo";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

const NEWS_KINDS = {
  injury: { label: "Lesión", re: /injur|sprain|strain|torn|tear|surgery|fractur|concussion|ruled out|out for|day-to-day|questionable|doubtful|mri|knee|ankle|hamstring|achilles|groin|calf|back spasm|illness|return(s|ed)? from|lesi[oó]n|baja/i },
  move: { label: "Fichaje", re: /\btrade[sd]?\b|\bsign(s|ed|ing)?\b|agree[sd]?|\bdeal\b|waive[sd]?|releas(e|es|ed)|contract|extension|acquir|free agen|buyout|two-way|fichaj|traspas|renueva/i },
  game: { label: "Partido", re: /\bbeat(s)?\b|\bwin(s)?\b|\blose(s)?\b|\bdefeat|\brout|rally|rallies|comeback|overtime|triple-double|career-high|\bscores?\b|\bpoints\b|recap|opener|\bvs\.?\b/i },
};
const kindOf = (a) => {
  const txt = `${a.headline} ${a.description} ${a.tags.join(" ")}`;
  return Object.keys(NEWS_KINDS).find((k) => NEWS_KINDS[k].re.test(txt)) ?? "general";
};

const News = {
  items: [],
  seen: new Set(),
  first: true,
  filter: "all",
  tab: "news",
  timer: null,
  lastVisit: 0,
  updatedAt: null,
  injuries: null,
  moves: null,

  init() {
    try { this.lastVisit = +localStorage.getItem("nbahub-news-visit") || 0; } catch {}
    $("#news-filters").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      this.filter = b.dataset.f;
      $$("#news-filters button").forEach((x) => x.classList.toggle("active", x === b));
      this.renderList();
    });
    $("#news-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      this.showTab(b.dataset.tab);
    });
    $("#notify-btn").addEventListener("click", () => this.askPermission());
    $("#inj-team").addEventListener("change", () => this.renderInjuries());
    $("#inj-search").addEventListener("input", () => this.renderInjuries());
    this.updateNotifyBtn();
    this.poll();
    this.timer = setInterval(() => this.poll(), 60000);
    setInterval(() => this.tickTimes(), 30000);
  },

  async poll() {
    try {
      const list = await Api.news();
      const fresh = list.filter((a) => !this.seen.has(a.id));
      list.forEach((a) => this.seen.add(a.id));
      if (!this.first && fresh.length) {
        fresh.slice(0, 3).forEach((a) => this.announce(a));
        fresh.forEach((a) => (a.isNew = true));
      }
      const byId = new Map(this.items.map((a) => [a.id, a]));
      list.forEach((a) => byId.set(a.id, { ...a, isNew: byId.get(a.id)?.isNew || a.isNew }));
      this.items = [...byId.values()].sort((a, b) => b.published - a.published).slice(0, 80);
      this.first = false;
      this.updatedAt = new Date();
      this.renderList();
      this.renderHome();
      this.updateBadge();
    } catch {
      if (!this.items.length) {
        empty($("#news-list"), "No se pudieron cargar las noticias. Se reintentará automáticamente cada minuto.");
        empty($("#home-news"), "No se pudieron cargar las noticias.");
      }
    }
    this.tickTimes();
  },

  card(a, compact = false) {
    const kind = kindOf(a);
    return `
      <a class="news-card ${compact ? "compact" : ""} ${a.isNew ? "is-new" : ""}" href="${esc(a.link || "#noticias")}" ${a.link ? 'target="_blank" rel="noopener"' : ""}>
        ${a.image ? `<div class="news-img"><img src="${esc(a.image)}" alt="" loading="lazy" onerror="this.parentNode.remove()" /></div>` : ""}
        <div class="news-body">
          <div class="news-meta">
            <span class="ntag ${kind}">${kind === "general" ? "NBA" : NEWS_KINDS[kind].label}</span>
            ${a.isNew ? `<span class="ntag new">Nuevo</span>` : ""}
            <time data-ts="${+a.published}">${timeAgo(a.published)}</time>
          </div>
          <h3>${esc(a.headline)}</h3>
          ${compact ? "" : `<p>${esc(a.description)}</p>`}
        </div>
      </a>`;
  },

  renderList() {
    const el = $("#news-list");
    const list = this.items.filter((a) => this.filter === "all" || kindOf(a) === this.filter);
    el.innerHTML = list.length
      ? list.map((a) => this.card(a)).join("")
      : `<p class="muted">No hay noticias de este tipo ahora mismo.</p>`;
  },

  renderHome() {
    const el = $("#home-news");
    if (el) el.innerHTML = this.items.slice(0, 4).map((a) => this.card(a, true)).join("");
  },

  tickTimes() {
    $$("time[data-ts]").forEach((t) => (t.textContent = timeAgo(new Date(+t.dataset.ts))));
    const u = $("#news-updated");
    if (u && this.updatedAt) u.textContent = `Actualizado ${timeAgo(this.updatedAt)} · se refresca cada minuto`;
  },

  updateBadge() {
    const unread = this.items.filter((a) => +a.published > this.lastVisit).length;
    const badge = $("#news-badge");
    const onNews = location.hash.startsWith("#noticias");
    badge.hidden = onNews || !this.lastVisit || !unread;
    badge.textContent = unread > 9 ? "9+" : unread;
  },

  visited() {
    this.lastVisit = Date.now();
    try { localStorage.setItem("nbahub-news-visit", this.lastVisit); } catch {}
    this.updateBadge();
    if (this.tab === "injuries" && !this.injuries) this.loadInjuries();
  },

  announce(a) {
    const kind = kindOf(a);
    toast(`<span class="ntag ${kind}">${kind === "general" ? "Última hora" : NEWS_KINDS[kind].label}</span><strong>${esc(a.headline)}</strong>`, a.link);
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try { new Notification("NBA Hub · " + (kind === "general" ? "Última hora" : NEWS_KINDS[kind].label), { body: a.headline, icon: a.image || undefined }); } catch {}
    }
  },

  askPermission() {
    if (!("Notification" in window)) return toast("Tu navegador no admite notificaciones.");
    Notification.requestPermission().then(() => this.updateNotifyBtn());
  },
  updateNotifyBtn() {
    const b = $("#notify-btn");
    if (!("Notification" in window)) return (b.hidden = true);
    const on = Notification.permission === "granted";
    b.textContent = on ? "🔔 Avisos activados" : "🔔 Activar avisos";
    b.disabled = on || Notification.permission === "denied";
  },

  showTab(tab) {
    this.tab = tab;
    $$("#news-tabs button").forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
    $$(".news-pane").forEach((p) => (p.hidden = p.dataset.pane !== tab));
    if (tab === "injuries") this.loadInjuries();
    if (tab === "moves") this.loadMoves();
  },

  // Parte de lesiones de toda la liga
  async loadInjuries() {
    const el = $("#inj-list");
    if (!this.injuries) skeleton(el, 6, 90);
    try {
      this.injuries = await Api.injuries();
      const sel = $("#inj-team");
      if (sel.options.length <= 1)
        sel.insertAdjacentHTML("beforeend", this.injuries.filter((t) => t.list.length).map((t) => `<option value="${esc(t.teamId)}">${esc(t.team)}</option>`).join(""));
      this.renderInjuries();
    } catch {
      empty(el, "No se pudo cargar el parte de lesiones en este momento.");
    }
  },

  renderInjuries() {
    if (!this.injuries) return;
    const team = $("#inj-team").value;
    const q = $("#inj-search").value.trim().toLowerCase();
    const statusCls = (s) => (/out|baja/i.test(s) ? "out" : /day|doubt|question|duda/i.test(s) ? "dtd" : "ok");
    const statusEs = (s) => ({ Out: "Baja", "Day-To-Day": "Día a día", Questionable: "Duda", Doubtful: "Muy dudoso", Probable: "Probable", Suspension: "Sanción" })[s] ?? s;
    const html = this.injuries
      .filter((t) => (team === "all" || t.teamId === team) && t.list.length)
      .map((t) => {
        const list = t.list.filter((p) => !q || p.name.toLowerCase().includes(q));
        if (!list.length) return "";
        const local = TEAMS.find((x) => String(x.espn) === t.teamId);
        return `<div class="inj-team" style="--c:${local?.color ?? "#3a4258"}">
          <h3>${local ? `<img src="${LOGO(local.abbr)}" alt="" />` : ""}${esc(t.team)}<span>${list.length}</span></h3>
          ${list.map((p) => `
            <div class="inj-row">
              <div class="inj-photo">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}</div>
              <div class="inj-info">
                <strong>${esc(p.name)} <small>${esc(p.pos)}</small></strong>
                <span>${esc(p.comment || p.detail)}</span>
                ${p.returnDate ? `<small class="muted">Regreso estimado: ${esc(new Date(p.returnDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" }))}</small>` : ""}
              </div>
              <span class="status ${statusCls(p.status)}">${esc(statusEs(p.status))}</span>
            </div>`).join("")}
        </div>`;
      })
      .join("");
    $("#inj-list").innerHTML = html || `<p class="muted">Sin lesionados que coincidan.</p>`;
  },

  // Movimientos de plantilla (fichajes, cortes, traspasos)
  async loadMoves() {
    const el = $("#moves-list");
    skeleton(el, 6, 64);
    try {
      this.moves = await Api.transactions();
      if (!this.moves.length) throw new Error();
      el.innerHTML = this.moves.slice(0, 60).map((m) => `
        <div class="move-row">
          ${m.logo || m.abbr ? `<img src="${esc(m.logo || LOGO(m.abbr))}" alt="" loading="lazy" />` : "<span></span>"}
          <div><strong>${esc(m.team)}</strong><p>${esc(m.text)}</p></div>
          <time>${m.date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</time>
        </div>`).join("");
    } catch {
      const related = this.items.filter((a) => kindOf(a) === "move");
      el.innerHTML = `<p class="muted">No se pudo cargar el registro oficial de movimientos. Noticias de fichajes recientes:</p>` +
        (related.map((a) => this.card(a)).join("") || `<p class="muted">Sin noticias de fichajes ahora mismo.</p>`);
    }
  },
};

// ---------- Avisos emergentes ----------
function toast(html, link) {
  const box = $("#toasts");
  const t = document.createElement(link ? "a" : "div");
  t.className = "toast";
  if (link) { t.href = link; t.target = "_blank"; t.rel = "noopener"; }
  t.innerHTML = `<span class="toast-dot"></span><div>${html}</div>`;
  box.prepend(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 9000);
  while (box.children.length > 3) box.lastElementChild.remove();
}
