// Descarga una copia de los datos de ESPN para que la web tenga respaldo
// si el navegador no puede leer la API directamente.
// Uso: node scripts/snapshot.mjs <carpeta-de-salida>
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = process.argv[2] ?? "snapshot";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_V2 = "https://site.api.espn.com/apis/v2/sports/basketball/nba";
const TEAM_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const day = 86400000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "nba-hub-snapshot" } });
      if (res.ok) return await res.json();
      console.warn(`HTTP ${res.status} ${url}`);
    } catch (e) {
      console.warn(`Error ${url}: ${e.message}`);
    }
    await sleep(1500 * (i + 1));
  }
  return null;
}

async function save(name, data) {
  if (!data) return false;
  await writeFile(join(OUT, name), JSON.stringify(data));
  return true;
}

await mkdir(OUT, { recursive: true });
const now = new Date();
const report = {};

// Calendario: desde hace 3 días hasta dentro de 10
const scoreboard = await get(`${ESPN}/scoreboard?dates=${ymd(new Date(+now - 3 * day))}-${ymd(new Date(+now + 10 * day))}&limit=1000`);
report.scoreboard = await save("scoreboard.json", scoreboard);

report.standings = await save("standings.json", await get(`${ESPN_V2}/standings`));
report.news = await save("news.json", await get(`${ESPN}/news?limit=50`));
report.injuries = await save("injuries.json", await get(`${ESPN}/injuries`));
report.transactions = await save("transactions.json", await get(`${ESPN}/transactions`));

// Fichas de los partidos de hoy y de ayer (en directo o recién terminados) y de los de mañana
const events = scoreboard?.events ?? [];
const near = events.filter((e) => Math.abs(new Date(e.date) - now) < 1.5 * day);
let summaries = 0;
for (const e of near) {
  if (await save(`summary-${e.id}.json`, await get(`${ESPN}/summary?event=${e.id}`))) summaries++;
}
report.summaries = summaries;

// Borra fichas de partidos que ya no están en el calendario guardado
const keep = new Set(events.map((e) => `summary-${e.id}.json`));
for (const f of await readdir(OUT)) {
  if (f.startsWith("summary-") && !keep.has(f)) await rm(join(OUT, f));
}

let prev = {};
try { prev = JSON.parse(await readFile(join(OUT, "meta.json"), "utf8")); } catch {}

// Plantillas: se renuevan cada 12 horas (las fechas de los ficheros no sirven tras un checkout)
let rosters = 0;
let rostersAt = prev.rostersAt;
if (!rostersAt || Date.now() - new Date(rostersAt) > 12 * 3600e3) {
  for (const id of TEAM_IDS) {
    if (await save(`roster-${id}.json`, await get(`${ESPN}/teams/${id}/roster`))) rosters++;
  }
  if (rosters) rostersAt = now.toISOString();
}
report.rosters = rosters;

// Estadísticas de temporada de todos los jugadores (comparador y fichas): cada hora
let statsAt = prev.statsAt;
if (!statsAt || Date.now() - new Date(statsAt) > 3600e3) {
  const stats = await get("https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&limit=700&sort=offensive.avgPoints%3Adesc");
  if (await save("players.json", stats)) statsAt = now.toISOString();
  report.players = Boolean(stats);
}

await save("meta.json", { updated: now.toISOString(), rostersAt, statsAt, report });
console.log(JSON.stringify(report));
