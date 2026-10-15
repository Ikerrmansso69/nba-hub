// Cliente mínimo para la API pública (no oficial) de ESPN. No requiere clave.
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_V2 = "https://site.api.espn.com/apis/v2/sports/basketball/nba";

const cache = new Map();

async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

const ymd = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

// Normaliza un evento de ESPN a un objeto sencillo
function parseEvent(ev) {
  const comp = ev.competitions?.[0] ?? {};
  const side = (ha) => {
    const c = comp.competitors?.find((x) => x.homeAway === ha) ?? {};
    return {
      id: c.team?.id,
      abbr: (c.team?.abbreviation ?? "").toLowerCase(),
      name: c.team?.displayName ?? "",
      short: c.team?.shortDisplayName ?? c.team?.displayName ?? "",
      logo: c.team?.logo,
      score: c.score,
      record: c.records?.[0]?.summary ?? "",
      winner: c.winner,
    };
  };
  return {
    id: ev.id,
    date: new Date(ev.date),
    state: ev.status?.type?.state, // pre | in | post
    detail: ev.status?.type?.shortDetail ?? "",
    seasonType: ev.season?.type, // 1 pretemporada · 2 regular · 3 playoffs · 5/6 play-in / NBA Cup
    note: comp.notes?.[0]?.headline ?? "",
    venue: comp.venue?.fullName ?? "",
    tv: (comp.broadcasts ?? []).flatMap((b) => b.names ?? []).join(", "),
    home: side("home"),
    away: side("away"),
  };
}

const Api = {
  async scoreboard(from, to = from) {
    const range = ymd(from) === ymd(to) ? ymd(from) : `${ymd(from)}-${ymd(to)}`;
    const data = await getJSON(`${ESPN}/scoreboard?dates=${range}&limit=200`);
    return (data.events ?? []).map(parseEvent).sort((a, b) => a.date - b.date);
  },

  async standings() {
    const data = await getJSON(`${ESPN_V2}/standings`);
    return (data.children ?? []).map((conf) => ({
      name: conf.name,
      teams: (conf.standings?.entries ?? [])
        .map((e) => {
          const stat = (n) => e.stats?.find((s) => s.name === n || s.type === n);
          return {
            id: e.team?.id,
            abbr: (e.team?.abbreviation ?? "").toLowerCase(),
            name: e.team?.displayName,
            logo: e.team?.logos?.[0]?.href,
            wins: +(stat("wins")?.value ?? 0),
            losses: +(stat("losses")?.value ?? 0),
            pct: stat("winPercent")?.displayValue ?? "-",
            gb: stat("gamesBehind")?.displayValue ?? "-",
            streak: stat("streak")?.displayValue ?? "-",
            seed: +(stat("playoffSeed")?.value ?? 99),
          };
        })
        .sort((a, b) => a.seed - b.seed || b.wins - a.wins),
    }));
  },

  async team(id) {
    const data = await getJSON(`${ESPN}/teams/${id}`);
    return data.team;
  },

  async roster(id) {
    const data = await getJSON(`${ESPN}/teams/${id}/roster`);
    // La respuesta puede venir plana o agrupada por posiciones
    const raw = data.athletes ?? [];
    const list = raw.flatMap((a) => (a.items ? a.items : [a]));
    return list.map((p) => ({
      id: p.id,
      name: p.displayName ?? p.fullName,
      jersey: p.jersey ?? "",
      pos: p.position?.abbreviation ?? "",
      height: p.displayHeight ?? "",
      weight: p.displayWeight ?? "",
      age: p.age ?? "",
      college: p.college?.name ?? "",
      country: p.birthPlace?.country ?? "",
      photo: p.headshot?.href ?? `https://a.espncdn.com/i/headshots/nba/players/full/${p.id}.png`,
    }));
  },
};
