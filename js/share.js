// ---------- Tarjeta del resultado para compartir (imagen estilo marcador de TV) ----------
const ShareCard = {
  loadImg(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  },

  async make(view) {
    const away = view.side("away"), home = view.side("home");
    const state = view.state();
    const W = 1080, H = 1080;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    // Fondo con los colores de los dos equipos
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, away.color); g.addColorStop(0.48, "#07090f"); g.addColorStop(0.52, "#07090f"); g.addColorStop(1, home.color);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = "rgba(7,9,15,.55)"; x.fillRect(0, 0, W, H);
    // Líneas de pista
    x.strokeStyle = "rgba(255,255,255,.07)"; x.lineWidth = 4;
    x.beginPath(); x.arc(W / 2, H / 2, 170, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();

    const font = (size, weight = 800) => `${weight} ${size}px Inter, "Segoe UI", Arial, sans-serif`;
    x.textAlign = "center"; x.fillStyle = "#fff";
    // Estado
    const status = state === "post" ? "FINAL" : state === "in" ? `EN VIVO · ${view.comp().status?.type?.shortDetail ?? ""}` : "PRÓXIMO PARTIDO";
    x.font = font(34); x.fillStyle = state === "in" ? "#ff2d55" : "#ff6b1a";
    x.fillText(status, W / 2, 120);
    // Logos
    const [la, lh] = await Promise.all([this.loadImg(away.logo), this.loadImg(home.logo)]);
    const logo = (img, t, cx) => {
      if (img) { try { x.drawImage(img, cx - 130, 200, 260, 260); return; } catch {} }
      x.fillStyle = t.color; x.beginPath(); x.arc(cx, 330, 120, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#fff"; x.font = font(80); x.fillText(t.abbr.toUpperCase(), cx, 358);
    };
    logo(la, away, 270); logo(lh, home, 810);
    // Nombres
    x.fillStyle = "#fff"; x.font = font(46);
    x.fillText(away.short.toUpperCase(), 270, 530); x.fillText(home.short.toUpperCase(), 810, 530);
    x.font = font(26, 600); x.fillStyle = "rgba(255,255,255,.65)";
    x.fillText("VISITANTE", 270, 570); x.fillText("LOCAL", 810, 570);
    // Marcador
    if (state !== "pre") {
      x.font = font(190, 900);
      x.fillStyle = away.winner || state === "in" ? "#fff" : "rgba(255,255,255,.55)"; x.fillText(String(away.score), 300, 780);
      x.fillStyle = home.winner || state === "in" ? "#fff" : "rgba(255,255,255,.55)"; x.fillText(String(home.score), 780, 780);
      x.fillStyle = "rgba(255,255,255,.5)"; x.font = font(120, 700); x.fillText("-", W / 2, 765);
    } else {
      x.font = font(150, 900); x.fillStyle = "#fff"; x.fillText("VS", W / 2, 770);
    }
    // Máximos anotadores
    const tops = [view.topScorer(away.id), view.topScorer(home.id)];
    x.font = font(30, 600); x.fillStyle = "rgba(255,255,255,.85)";
    tops.forEach((p, i) => { if (p) x.fillText(`${p.name} · ${p.pts} pts`, i ? 810 : 270, 860); });
    // Fecha y marca
    const date = view.comp().date ? new Date(view.comp().date).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "";
    x.font = font(26, 600); x.fillStyle = "rgba(255,255,255,.6)"; x.fillText(date, W / 2, 940);
    x.font = font(44, 900); x.fillStyle = "#fff"; x.textAlign = "right"; x.fillText("NBA", W / 2 - 2, 1020);
    x.fillStyle = "#ff6b1a"; x.textAlign = "left"; x.fillText("HUB", W / 2 + 2, 1020);
    return c;
  },

  async share(view) {
    const away = view.side("away"), home = view.side("home");
    const canvas = await this.make(view);
    const name = `${away.abbr}-${home.abbr}.png`;
    const text = view.state() === "pre"
      ? `🏀 ${away.short} vs ${home.short} · síguelo en NBA Hub`
      : `🏀 ${away.short} ${away.score} - ${home.score} ${home.short}${view.state() === "in" ? " (en vivo)" : ""} · NBA Hub`;
    const url = `https://ikerrmansso69.github.io/nba-hub/#partido/${view.id}`;
    let blob = null;
    try { blob = await new Promise((r) => canvas.toBlob(r, "image/png")); } catch {}
    if (!blob) {
      // Si el navegador no deja exportar la imagen (logos externos), se comparte solo el texto
      try { if (navigator.share) return await navigator.share({ title: "NBA Hub", text, url }); await navigator.clipboard.writeText(`${text}\n${url}`); toast("Resultado copiado al portapapeles."); } catch {}
      return;
    }
    const file = new File([blob], name, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text: `${text}\n${url}` });
    } catch (e) { if (e?.name === "AbortError") return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("🖼️ Imagen descargada. ¡Ya puedes compartirla!");
  },
};
