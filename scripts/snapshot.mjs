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

// Calendario: desde hace 3 días hasta dentro de 10, día a día (más fiable que un rango)
const allEvents = [];
let days = 0;
for (let i = -3; i <= 10; i++) {
  const sb = await get(`${ESPN}/scoreboard?dates=${ymd(new Date(+now + i * day))}`);
  if (!sb) continue;
  days++;
  allEvents.push(...(sb.events ?? []));
}
const scoreboard = days ? { events: allEvents } : null;
report.scoreboard = await save("scoreboard.json", scoreboard);
report.games = allEvents.length;

report.standings = await save("standings.json", await get(`${ESPN_V2}/standings?seasontype=2`));
report.news = await save("news.json", await get(`${ESPN}/news?limit=50`));
// Parte de lesiones reducido a lo que usa la web (el original pesa ~1 MB)
const inj = await get(`${ESPN}/injuries`);
report.injuries = await save("injuries.json", inj && {
  injuries: (inj.injuries ?? []).map((t) => ({
    id: t.id, displayName: t.displayName,
    injuries: (t.injuries ?? []).map((i) => ({
      status: i.status, shortComment: i.shortComment, date: i.date,
      type: i.type && { description: i.type.description },
      details: i.details && { type: i.details.type, detail: i.details.detail, side: i.details.side, returnDate: i.details.returnDate },
      athlete: i.athlete && { displayName: i.athlete.displayName, headshot: i.athlete.headshot && { href: i.athlete.headshot.href }, position: i.athlete.position && { abbreviation: i.athlete.position.abbreviation } },
    })),
  })),
});
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
let statsAt = prev.statsLiteAt; // (statsAt era el formato antiguo, de varios MB)
if (!statsAt || Date.now() - new Date(statsAt) > 3600e3) {
  const stats = await get("https://site.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&limit=700&sort=offensive.avgPoints%3Adesc");
  // Versión reducida: el original pesa varios MB
  const lite = stats && {
    season: stats.requestedSeason?.displayName ?? "",
    players: (stats.athletes ?? []).map((a) => {
      const st = {};
      (a.categories ?? []).forEach((c) => {
        const names = stats.categories?.find((x) => x.name === c.name)?.names ?? [];
        names.forEach((n, i) => (st[n] = c.values?.[i]));
      });
      const pick = ["gamesPlayed", "avgMinutes", "avgPoints", "avgRebounds", "avgAssists", "avgSteals", "avgBlocks", "avgTurnovers", "fieldGoalPct", "threePointFieldGoalPct", "freeThrowPct", "avgThreePointFieldGoalsMade", "doubleDouble", "tripleDouble"];
      return {
        id: a.athlete?.id, name: a.athlete?.displayName, short: a.athlete?.shortName,
        team: a.athlete?.teamShortName, teamName: a.athlete?.teamName, pos: a.athlete?.position?.abbreviation, age: a.athlete?.age,
        photo: a.athlete?.headshot?.href,
        s: Object.fromEntries(pick.map((k) => [k, typeof st[k] === "number" ? Math.round(st[k] * 10) / 10 : st[k]])),
      };
    }),
  };
  if (await save("players.json", lite)) statsAt = now.toISOString();
  report.players = lite?.players.length ?? 0;
}

await save("meta.json", { updated: now.toISOString(), rostersAt, statsLiteAt: statsAt, report });
console.log(JSON.stringify(report));
