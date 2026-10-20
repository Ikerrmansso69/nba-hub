// ---------- Juego: Adivina el jugador ----------
const Guess = {
  cur: null,
  tries: 0,
  max: 5,
  over: false,
  store: (() => { try { return JSON.parse(localStorage.getItem("nbahub-guess") || "{}"); } catch { return {}; } })(),

  save() { try { localStorage.setItem("nbahub-guess", JSON.stringify(this.store)); } catch {} },

  async init() {
    const el = $("#guess");
    skeleton(el, 1, 320);
    await Players.load();
    const pool = (Players.data?.players ?? []).filter((p) => p.photo && (p.s.gamesPlayed ?? 0) >= 15).sort((a, b) => (b.s.avgPoints ?? 0) - (a.s.avgPoints ?? 0)).slice(0, 150);
    if (!pool.length) return empty(el, "No se pudieron cargar los jugadores para el juego.");
    this.pool = pool;
    this.next();
  },

  fails: 0,
  // Si una foto no carga, se cambia de jugador (y tras varios fallos se juega sin foto)
  photoFail(img) {
    if (++this.fails < 4) return this.next();
    img.onerror = null;
    img.src = PLACEHOLDER;
  },

  next() {
    this.cur = this.pool[Math.floor(Math.random() * this.pool.length)];
    this.tries = 0;
    this.over = false;
    this.render();
  },

  clues() {
    const p = this.cur, s = p.s, t = teamByAbbr(String(p.team).toLowerCase());
    return [
      `Posición: <b>${esc(p.pos ?? "?")}</b> · ${fmtStat(s.avgPoints)} puntos por partido en ${esc(Players.data.season)}`,
      `${fmtStat(s.avgRebounds)} rebotes y ${fmtStat(s.avgAssists)} asistencias por partido`,
      `Equipo: ${t ? `<img src="${LOGO(t.abbr)}" alt="" class="g-logo" /> <b>${esc(t.name)}</b>` : `<b>${esc(p.teamName ?? p.team ?? "?")}</b>`}`,
      `Tiene <b>${esc(p.age ?? "?")}</b> años`,
      `Sus iniciales son <b>${esc(p.name.split(" ").map((w) => w[0]).join(". "))}.</b>`,
    ];
  },

  render(msg = "") {
    const el = $("#guess");
    const st = this.store;
    const blur = this.over ? 0 : Math.max(0, 22 - this.tries * 5);
    const shown = this.clues().slice(0, this.over ? 5 : this.tries + 1);
    el.innerHTML = `
      <div class="guess">
        <div class="g-photo"><img src="${esc(safeUrl(this.cur.photo))}" alt="" style="filter: blur(${blur}px) ${this.over ? "" : "grayscale(.6)"}" onerror="Guess.photoFail(this)" />
          ${this.over ? `<span class="g-name">${esc(this.cur.name)}</span>` : `<span class="g-q">?</span>`}</div>
        <div class="g-body">
          <div class="g-score"><span>Intento <b>${Math.min(this.tries + 1, this.max)}/${this.max}</b></span><span>Puntos <b>${st.points ?? 0}</b></span><span>Racha <b>${st.streak ?? 0}${(st.streak ?? 0) >= 3 ? " 🔥" : ""}</b></span></div>
          <ol class="g-clues">${shown.map((c) => `<li>${c}</li>`).join("")}</ol>
          ${msg ? `<p class="g-msg">${msg}</p>` : ""}
          ${this.over
            ? `<div class="g-actions"><button class="btn primary" id="g-next">Siguiente jugador →</button><a class="btn" href="#jugador/${esc(this.cur.id)}">Ver su ficha</a></div>`
            : `<form class="g-form" id="g-form">
                <div class="search"><input type="search" id="g-input" list="g-list" placeholder="Escribe el nombre…" autocomplete="off" aria-label="Nombre del jugador" /></div>
                <button class="btn primary" type="submit">Probar</button>
                <button class="btn" type="button" id="g-skip">Rendirme</button>
                <datalist id="g-list">${Players.data.players.map((p) => `<option value="${esc(p.name)}"></option>`).join("")}</datalist>
              </form>`}
        </div>
      </div>`;
    if (this.over) return $("#g-next").addEventListener("click", () => this.next());
    $("#g-form").addEventListener("submit", (e) => { e.preventDefault(); this.guess($("#g-input").value); });
    $("#g-skip").addEventListener("click", () => this.finish(false));
  },

  guess(v) {
    const n = Search.norm(v.trim());
    if (!n) return;
    if (n === Search.norm(this.cur.name)) return this.finish(true);
    this.tries++;
    if (this.tries >= this.max) return this.finish(false);
    this.render(`❌ No es ${esc(v)}. Nueva pista desbloqueada.`);
    $("#g-input").focus();
  },

  finish(won) {
    this.over = true;
    const pts = won ? this.max - this.tries : 0;
    this.store.points = (this.store.points ?? 0) + pts;
    this.store.streak = won ? (this.store.streak ?? 0) + 1 : 0;
    this.store.best = Math.max(this.store.best ?? 0, this.store.streak);
    this.save();
    this.render(won ? `✅ ¡Correcto! +${pts} ${pts === 1 ? "punto" : "puntos"}.` : `Era <b>${esc(this.cur.name)}</b>. ¡A por el siguiente!`);
  },
};
