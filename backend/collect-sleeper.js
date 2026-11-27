/**
 * TCWR Tanking Meter — Sleeper snapshot collector
 *
 * Reads public Sleeper league data and writes timestamped lineup snapshots
 * to the existing Firebase project using the Firebase Admin SDK.
 *
 * This collector deliberately records evidence only. It does NOT assign
 * tanking scores or infer intent. Scoring rules will be implemented after
 * the raw data has been validated against the league.
 */

import admin from "firebase-admin";

const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID || "1328431789223477248";
const MAX_FANTASY_WEEK = 14;
const SLEEPER_BASE = "https://api.sleeper.app/v1";
const FIRESTORE_ROOT = "tankingMeter";

const NAME_TRANSLATOR = {
  "mgreg00x": "Matt",
  "SanDiegoSuperBurgers": "Sylvester",
  "BUNNIESUPBUDDY": "Evelyn",
  "BUNNIESUPBUDDYEV": "Evelyn",
  "lightmyBONfire": "Bonnie",
  "dudenamedtrevor": "Trevor",
  "bcanfield0913": "Brittany",
  "dianne399": "Dianne",
  "LycaonPictus": "Brad",
  "EmMack": "Emily",
  "DawgPound247": "Brian",
  "TB12isDaddy": "An",
  "CrazyCougars": "Jess",
  "Waddlepenguin": "Nate",
  "drvargas": "Steven"
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function initializeFirebase() {
  if (admin.apps.length) return admin.firestore();

  // GitHub Actions secret contains the complete service-account JSON.
  const raw = requireEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
  });

  return admin.firestore();
}

async function sleeperGet(path) {
  const response = await fetch(`${SLEEPER_BASE}${path}`, {
    headers: { "User-Agent": "TCWR-Tanking-Meter/1.0" },
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(`Sleeper API ${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTeam(roster, userById, matchupByRoster) {
  const user = userById.get(roster.owner_id) || {};
  const metadata = safeObject(user.metadata);
  const settings = safeObject(roster.settings);
  const matchup = matchupByRoster.get(roster.roster_id) || null;

  const username = user.display_name || user.username || "Unknown";
  const translatedName = NAME_TRANSLATOR[username] || username;

  const players = Array.isArray(roster.players) ? roster.players : [];
  const starters = Array.isArray(matchup?.starters)
    ? matchup.starters
    : (Array.isArray(roster.starters) ? roster.starters : []);

  const starterSet = new Set(starters.map(String));
  const playerPoints = safeObject(matchup?.players_points);

  return {
    rosterId: roster.roster_id,
    ownerId: roster.owner_id || null,
    username,
    managerName: translatedName,
    teamName: metadata.team_name || user.display_name || translatedName,
    starters: starters.map(String),
    bench: players.map(String).filter(id => !starterSet.has(id)),
    players: players.map(String),
    reserve: Array.isArray(roster.reserve) ? roster.reserve.map(String) : [],
    taxi: Array.isArray(roster.taxi) ? roster.taxi.map(String) : [],
    injuredReserve: Array.isArray(roster.injured_reserve)
      ? roster.injured_reserve.map(String)
      : [],
    playerPoints: Object.fromEntries(
      Object.entries(playerPoints).map(([id, points]) => [id, Number(points) || 0])
    ),
    matchup: matchup ? {
      matchupId: matchup.matchup_id ?? null,
      points: Number(matchup.points) || 0,
      startersPoints: Number(matchup.starters_points) || 0,
      playersPoints: Number(matchup.players_points_total) || 0
    } : null,
    record: {
      wins: Number(settings.wins) || 0,
      losses: Number(settings.losses) || 0,
      ties: Number(settings.ties) || 0,
      pointsFor: (Number(settings.fpts) || 0) + (Number(settings.fpts_decimal) || 0) / 100,
      pointsAgainst: (Number(settings.fpts_against) || 0) + (Number(settings.fpts_against_decimal) || 0) / 100
    }
  };
}

async function main() {
  const db = initializeFirebase();

  const [league, users, rosters, nflState] = await Promise.all([
    sleeperGet(`/league/${LEAGUE_ID}`),
    sleeperGet(`/league/${LEAGUE_ID}/users`),
    sleeperGet(`/league/${LEAGUE_ID}/rosters`),
    sleeperGet("/state/nfl")
  ]);

  if (!Array.isArray(users) || !Array.isArray(rosters)) {
    throw new Error("Sleeper returned unexpected users or rosters data.");
  }
  if (rosters.length !== 14) {
    console.warn(`Expected 14 rosters, received ${rosters.length}. Snapshot will still be saved.`);
  }

  const weekRaw = Number(nflState.display_week ?? nflState.leg ?? nflState.week);
  const week = Math.min(MAX_FANTASY_WEEK, Math.max(1, Number.isFinite(weekRaw) ? weekRaw : 1));
  const season = String(league.season || nflState.season || new Date().getUTCFullYear());
  const seasonType = String(nflState.season_type || "unknown");

  const matchups = await sleeperGet(`/league/${LEAGUE_ID}/matchups/${week}`);
  const matchupByRoster = new Map(
    (Array.isArray(matchups) ? matchups : []).map(item => [item.roster_id, item])
  );
  const userById = new Map(users.map(user => [user.user_id, user]));

  const teams = rosters
    .map(roster => normalizeTeam(roster, userById, matchupByRoster))
    .sort((a, b) => Number(a.rosterId) - Number(b.rosterId));

  const now = new Date();
  const capturedAt = now.toISOString();
  const captureId = capturedAt.replace(/[-:.TZ]/g, "");
  const payload = {
    schemaVersion: 1,
    source: "sleeper-api",
    leagueId: LEAGUE_ID,
    leagueName: league.name || "TCWR Dynasty",
    season,
    seasonType,
    week,
    capturedAt,
    capturedAtEpochMs: now.getTime(),
    nflState: {
      week: nflState.week ?? null,
      displayWeek: nflState.display_week ?? null,
      leg: nflState.leg ?? null,
      season: nflState.season ?? null,
      seasonType: nflState.season_type ?? null,
      leagueSeason: nflState.league_season ?? null,
      seasonStartDate: nflState.season_start_date ?? null,
      seasonEndDate: nflState.season_end_date ?? null
    },
    teamCount: teams.length,
    teams
  };

  const weekRef = db
    .collection(FIRESTORE_ROOT)
    .doc("seasons")
    .collection(season)
    .doc("weeks")
    .collection(String(week))
    .doc("captures")
    .collection("items")
    .doc(captureId);

  await weekRef.set(payload);

  // Latest pointer makes the frontend lookup simple without scanning history.
  await db.collection(FIRESTORE_ROOT).doc("latest").set({
    season,
    week,
    captureId,
    capturedAt,
    teamCount: teams.length,
    source: "sleeper-api",
    schemaVersion: 1
  }, { merge: true });

  // One lightweight document per manager makes team lookup straightforward.
  const batch = db.batch();
  for (const team of teams) {
    const teamRef = db.collection(FIRESTORE_ROOT)
      .doc("seasons").collection(season)
      .doc("teams").collection("items")
      .doc(String(team.rosterId));

    batch.set(teamRef, {
      rosterId: team.rosterId,
      ownerId: team.ownerId,
      username: team.username,
      managerName: team.managerName,
      teamName: team.teamName,
      updatedAt: capturedAt
    }, { merge: true });
  }
  await batch.commit();

  console.log(JSON.stringify({
    ok: true,
    projectId: process.env.FIREBASE_PROJECT_ID || "from-service-account",
    leagueId: LEAGUE_ID,
    season,
    week,
    teamCount: teams.length,
    captureId,
    capturedAt,
    firestorePath: weekRef.path
  }, null, 2));
}

main().catch(error => {
  console.error("Tanking Meter collection failed:", error);
  process.exitCode = 1;
});
