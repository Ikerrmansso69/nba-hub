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

// Calendarios de los 30 equipos (temporada regular), reducidos: cada 2 horas
let schedAt = prev.schedAt;
let schedules = 0;
if (!schedAt || Date.now() - new Date(schedAt) > 2 * 3600e3) {
  for (const id of TEAM_IDS) {
    const sc = await get(`${ESPN}/teams/${id}/schedule?seasontype=2`);
    if (!sc) continue;
    const slim = {
      events: (sc.events ?? []).map((e) => {
        const c = e.competitions?.[0] ?? {};
        return {
          id: e.id, date: e.date,
          competitions: [{
            status: { type: { state: c.status?.type?.state, completed: c.status?.type?.completed, shortDetail: c.status?.type?.shortDetail } },
            competitors: (c.competitors ?? []).map((x) => ({
              homeAway: x.homeAway, winner: x.winner,
              score: x.score && { displayValue: x.score.displayValue ?? x.score },
              team: { id: x.team?.id, abbreviation: x.team?.abbreviation, displayName: x.team?.displayName, shortDisplayName: x.team?.shortDisplayName, logo: x.team?.logos?.[0]?.href ?? x.team?.logo },
            })),
            broadcasts: (c.broadcasts ?? []).map((b) => ({ media: { shortName: b.media?.shortName } })),
            notes: (c.notes ?? []).map((n) => ({ headline: n.headline })),
          }],
        };
      }),
    };
    if (await save(`schedule-${id}.json`, slim)) schedules++;
  }
  if (schedules) schedAt = now.toISOString();
}
report.schedules = schedules;

// NBA Cup: partidos de fase de grupos (a partir de los calendarios de los equipos)
const GROUPS = {
  "Este A": ["DET", "TOR", "ORL", "MIL", "BKN"], "Este B": ["NY", "PHI", "CLE", "MIA", "IND"], "Este C": ["BOS", "ATL", "CHA", "CHI", "WSH"],
  "Oeste A": ["DEN", "HOU", "PHX", "DAL", "UTAH"], "Oeste B": ["OKC", "MIN", "LAC", "NO", "MEM"], "Oeste C": ["LAL", "GS", "POR", "SAC", "SA"],
};
const groupOf = (abbr) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(abbr));
const cupGames = new Map();
for (const id of TEAM_IDS) {
  let sc;
  try { sc = JSON.parse(await readFile(join(OUT, `schedule-${id}.json`), "utf8")); } catch { continue; }
  for (const e of sc.events ?? []) {
    const c = e.competitions?.[0] ?? {};
    const [a, b] = (c.competitors ?? []).map((x) => x.team?.abbreviation);
    const d = new Date(e.date);
    const noted = (c.notes ?? []).some((n) => /cup/i.test(n.headline ?? ""));
    // Respaldo si ESPN no marca la nota: rivales del mismo grupo entre el 30 oct y el 28 nov
    const inWindow = d >= new Date("2026-10-30T12:00Z") && d <= new Date("2026-11-29T12:00Z");
    if (!(noted || (a && b && groupOf(a) && groupOf(a) === groupOf(b) && inWindow))) continue;
    cupGames.set(e.id, {
      id: e.id, date: e.date, group: groupOf(a) === groupOf(b) ? groupOf(a) : null,
      state: c.status?.type?.state, completed: c.status?.type?.completed,
      teams: (c.competitors ?? []).map((x) => ({ abbr: x.team?.abbreviation, homeAway: x.homeAway, score: x.score?.displayValue ?? null, winner: x.winner })),
    });
  }
}
report.cup = await save("cup.json", { groups: GROUPS, games: [...cupGames.values()].sort((x, y) => new Date(x.date) - new Date(y.date)) }) && cupGames.size;

// Récords de la temporada: se acumulan las mejores actuaciones de cada partido terminado
let season = { processed: [], perfs: [], teamHighs: [] };
try { season = JSON.parse(await readFile(join(OUT, "season.json"), "utf8")); } catch {}
const processed = new Set(season.processed);
const finals = events.filter((e) => e.status?.type?.completed && e.season?.type === 2 && !processed.has(e.id));
for (const e of finals.slice(0, 25)) {
  const sm = near.includes(e) ? JSON.parse(await readFile(join(OUT, `summary-${e.id}.json`), "utf8").catch(() => "null")) : await get(`${ESPN}/summary?event=${e.id}`);
  if (!sm?.boxscore?.players) continue;
  const comps = sm.header?.competitions?.[0]?.competitors ?? [];
  const abbrOf = (tid) => comps.find((x) => String(x.team?.id) === String(tid))?.team?.abbreviation;
  for (const g of sm.boxscore.players) {
    const st = g.statistics?.[0] ?? {};
    const keys = st.keys ?? [];
    const k = (name) => keys.indexOf(name);
    const team = g.team?.abbreviation, opp = comps.find((x) => String(x.team?.id) !== String(g.team?.id))?.team?.abbreviation;
    for (const a of st.athletes ?? []) {
      if (!a.stats?.length) continue;
      const v = (name) => +(a.stats[k(name)] ?? 0) || 0;
      const line = { id: a.athlete?.id, name: a.athlete?.displayName, team, opp, event: e.id, date: e.date, pts: v("points"), reb: v("rebounds"), ast: v("assists"), stl: v("steals"), blk: v("blocks"), threes: +String(a.stats[k("threePointFieldGoalsMade-threePointFieldGoalsAttempted")] ?? "0").split("-")[0] || 0 };
      const doubles = [line.pts, line.reb, line.ast, line.stl, line.blk].filter((x) => x >= 10).length;
      line.td = doubles >= 3;
      if (line.pts >= 30 || line.td || line.reb >= 18 || line.ast >= 14 || line.threes >= 7) season.perfs.push(line);
    }
  }
  for (const c of comps) season.teamHighs.push({ team: c.team?.abbreviation, opp: abbrOf(comps.find((x) => x !== c)?.team?.id), pts: +c.score || 0, event: e.id, date: e.date });
  processed.add(e.id);
}
season.processed = [...processed];
season.teamHighs = season.teamHighs.sort((a, b) => b.pts - a.pts).slice(0, 30);
season.perfs = season.perfs.sort((a, b) => b.pts - a.pts).slice(0, 400);
report.season = await save("season.json", season) && processed.size;

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

await save("meta.json", { updated: now.toISOString(), rostersAt, statsLiteAt: statsAt, schedAt, report });
console.log(JSON.stringify(report));
