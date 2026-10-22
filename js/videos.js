// ---------- Vídeos (mejores jugadas de ESPN) ----------
const Videos = {
  done: new Set(),
  list: [],

  src(v) {
    const s = v.links?.source ?? {};
    return safeUrl(s.HD?.href ?? s.href ?? s.mezzanine?.href ?? s.full?.href ?? "");
  },

  // Búsqueda del resumen oficial en YouTube (el canal de la NBA sí se ve en España)
  youtube(game, date) {
    if (!game) return "https://www.youtube.com/@NBA/videos";
    const d = (date ?? game.date) ? new Date(date ?? game.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
    const name = (t) => teamByAbbr(t.abbr) ? nickname(teamByAbbr(t.abbr)) : t.short;
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name(game.away)} at ${name(game.home)} full game highlights ${d}`)}`;
  },

  // ¿ESPN permite este vídeo en el país del visitante? (solo lo sabemos por la zona horaria)
  blockedHere(v) {
    const g = v.geoRestrictions;
    if (!g?.countries?.length) return false;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const cc = /^(Europe\/Madrid|Atlantic\/Canary|Africa\/Ceuta)$/.test(tz) ? "ES" : null;
    if (!cc) return false;
    return g.type === "whitelist" ? !g.countries.includes(cc) : g.countries.includes(cc);
  },

  card(v, game) {
    const src = this.src(v);
    const web = safeUrl(v.links?.web?.href ?? "");
    if (!src && !web) return "";
    const dur = v.duration ? `${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, "0")}` : "";
    const thumb = safeUrl(v.thumbnail ?? v.images?.[0]?.url ?? "");
    return `
      <article class="video" data-src="${esc(src)}" data-web="${esc(web)}" data-yt="${esc(this.youtube(game, v.originalPublishDate))}" data-blocked="${this.blockedHere(v) ? 1 : ""}">
        <button class="video-thumb" aria-label="Reproducir: ${esc(v.headline ?? "vídeo")}">
          ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}
          <span class="play" aria-hidden="true">▶</span>
          ${dur ? `<span class="dur">${dur}</span>` : ""}
        </button>
        <div class="video-body">
          ${game ? `<a class="video-game" href="#partido/${esc(game.id)}"><img src="${esc(game.away.logo || LOGO(game.away.abbr))}" alt="" />${esc(game.away.short)} ${esc(game.away.score)}-${esc(game.home.score)} ${esc(game.home.short)}<img src="${esc(game.home.logo || LOGO(game.home.abbr))}" alt="" /></a>` : ""}
          <h3>${esc(v.headline ?? "")}</h3>
        </div>
      </article>`;
  },

  // Reproduce dentro de la tarjeta; si no hay vídeo directo, abre ESPN
  init() {
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".video-thumb");
      if (!b) return;
      const card = b.closest(".video");
      const blocked = () => {
        const box = document.createElement("div");
        box.className = "video-blocked";
        box.innerHTML = `<p>ESPN no permite ver este vídeo desde España.</p><a class="btn primary" href="${esc(card.dataset.yt)}" target="_blank" rel="noopener">▶ Ver el resumen en YouTube</a>`;
        (card.querySelector(".video-player") ?? b).replaceWith(box);
      };
      if (card.dataset.blocked) return blocked();
      if (!card.dataset.src) return window.open(card.dataset.web, "_blank", "noopener");
      const video = document.createElement("video");
      video.src = card.dataset.src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.className = "video-player";
      video.onerror = blocked;
      $$(".video-player").forEach((v) => v.pause());
      b.replaceWith(video);
    });
  },

  // Portada: jugadas de los partidos terminados recientemente
  async loadHome(games) {
    const finals = games.filter((g) => g.state === "post" && g.id && !this.done.has(g.id)).slice(-8);
    if (!finals.length) return;
    finals.forEach((g) => this.done.add(g.id));
    const results = await Promise.all(finals.map((g) => Api.summary(g.id, false).then((s) => ({ g, v: s.videos ?? [] })).catch(() => ({ g, v: [] }))));
    results.forEach(({ g, v }) => v.slice(0, 3).forEach((x) => this.list.push({ v: x, g })));
    const html = this.list.slice(-12).reverse().map(({ v, g }) => this.card(v, g)).join("");
    if (!html) return;
    $("#home-videos-wrap").hidden = false;
    $("#home-videos").innerHTML = html;
  },
};
