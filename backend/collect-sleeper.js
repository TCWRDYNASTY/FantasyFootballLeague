/** TCWR Dynasty Tanking Meter — Sleeper collector and score publisher. */
import admin from "firebase-admin";
import { calculateSeasonScores } from "./score-tanking.js";

const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID || "1328431789223477248";
const MAX_FANTASY_WEEK = 14;
const SLEEPER_BASE = "https://api.sleeper.app/v1";
const PROJECTIONS_BASE = "https://api.sleeper.com/projections/nfl";
const ROOT = "tankingMeter";

const NAME_TRANSLATOR = {
  mgreg00x: "Matt", SanDiegoSuperBurgers: "Sylvester", BUNNIESUPBUDDY: "Evelyn",
  BUNNIESUPBUDDYEV: "Evelyn", lightmyBONfire: "Bonnie", dudenamedtrevor: "Trevor",
  bcanfield0913: "Brittany", dianne399: "Dianne", LycaonPictus: "Brad",
  EmMack: "Emily", DawgPound247: "Brian", TB12isDaddy: "An",
  CrazyCougars: "Jess", Waddlepenguin: "Nate", drvargas: "Steven"
};

function initializeFirebase() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON secret.");
    let serviceAccount;
    try { serviceAccount = JSON.parse(raw); }
    catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON."); }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
    });
  }
  return admin.firestore();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "TCWR-Tanking-Meter/1.0" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Sleeper API ${url} returned HTTP ${response.status}`);
  return response.json();
}

const sleeperGet = path => fetchJson(`${SLEEPER_BASE}${path}`);
const projectionsGet = (season, week, orderBy) => fetchJson(`${PROJECTIONS_BASE}/${season}/${week}?season_type=regular&order_by=${encodeURIComponent(orderBy)}`);

const asObject = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function normalizeWeekTeam(matchup, roster, userById, projectionByPlayer, scoringField) {
  const user = userById.get(roster?.owner_id) || {};
  const username = user.display_name || user.username || "Unknown";
  const starters = Array.isArray(matchup.starters) ? matchup.starters.map(String) : [];
  const playerPoints = Object.fromEntries(
    Object.entries(asObject(matchup.players_points)).map(([id, value]) => [id, Number(value) || 0])
  );
  const allPlayerIds = Array.isArray(matchup.players) ? matchup.players.map(String) : Object.keys(playerPoints);
  const playerInfo = {};
  const projections = {};
  for (const playerId of allPlayerIds) {
    const row = projectionByPlayer.get(String(playerId));
    const player = asObject(row?.player);
    playerInfo[String(playerId)] = {
      position: player.position || row?.position || null,
      injuryStatus: player.injury_status || player.injuryStatus || row?.injury_status || null,
      team: player.team || row?.team || null
    };
    const projected = asObject(row?.stats);
    const projectionPoints = projected[scoringField] ?? row?.[scoringField];
    if (projectionPoints !== undefined && projectionPoints !== null && Number.isFinite(Number(projectionPoints))) {
      projections[String(playerId)] = { points:Number(projectionPoints), injuryStatus:playerInfo[String(playerId)].injuryStatus };
    }
  }
  return {
    rosterId: matchup.roster_id,
    ownerId: roster?.owner_id || null,
    username,
    managerName: NAME_TRANSLATOR[username] || username,
    teamName: asObject(user.metadata).team_name || NAME_TRANSLATOR[username] || username,
    starters,
    playerPoints,
    playerInfo,
    projections,
    matchup: {
      matchupId: matchup.matchup_id ?? null,
      points: Number(matchup.points) || 0,
      startersPoints: Number(matchup.starters_points) || 0
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
  if (!Array.isArray(users) || !Array.isArray(rosters)) throw new Error("Unexpected Sleeper league data.");
  if (rosters.length !== 14) console.warn(`Expected 14 rosters; received ${rosters.length}.`);

  const season = String(league.season || nflState.season || new Date().getUTCFullYear());
  const displayWeek = Math.min(MAX_FANTASY_WEEK, Math.max(1, Number(nflState.display_week ?? nflState.leg ?? nflState.week) || 1));
  const userById = new Map(users.map(user => [user.user_id, user]));
  const rosterById = new Map(rosters.map(roster => [roster.roster_id, roster]));
  const scoringSettings = asObject(league.scoring_settings);
  const receptionValue = Number(scoringSettings.rec ?? 0);
  const scoringField = receptionValue >= 0.99 ? "pts_ppr" : receptionValue >= 0.49 ? "pts_half_ppr" : "pts_std";
  const now = new Date();
  const capturedAt = now.toISOString();

  // Re-fetch Weeks 1 through the current Sleeper display week on every run.
  // Only completed weeks are scored; the current week is collected but excluded.
  const weekNumbers = Array.from({ length: displayWeek }, (_, i) => i + 1);
  const weeklyData = [];
  for (const week of weekNumbers) {
    const [matchups, projectionRows] = await Promise.all([
      sleeperGet(`/league/${LEAGUE_ID}/matchups/${week}`),
      projectionsGet(season, week, scoringField).catch(error => {
        console.warn(`Week ${week}: historical projections unavailable (${error.message}). Category 2 will not score this week.`);
        return [];
      })
    ]);
    if (!Array.isArray(matchups)) throw new Error(`Unexpected matchup data for Week ${week}.`);
    const projectionByPlayer = new Map((Array.isArray(projectionRows) ? projectionRows : []).map(row => [String(row.player_id ?? row.player?.player_id ?? row.player?.id ?? ""), row]).filter(([id]) => id));
    const teams = matchups.map(item => normalizeWeekTeam(item, rosterById.get(item.roster_id), userById, projectionByPlayer, scoringField));
    const weekly = { schemaVersion: 2, source: "sleeper-api", leagueId: LEAGUE_ID, season, week, capturedAt, teamCount: teams.length, teams };
    weeklyData.push(weekly);

    // Stable latest document per week; repeated scheduled runs update rather than duplicate.
    await db.collection(ROOT).doc("seasons").collection(season)
      .doc("weeks").collection(String(week)).doc("latest")
      .set(weekly, { merge: true });
  }

  // Preserve timestamped captures for the in-progress week. These are useful
  // for reviewing what Sleeper exposed during the week; they are not treated as
  // an exact lineup-lock record.
  const currentWeekData = weeklyData.find(item => item.week === displayWeek);
  if (currentWeekData) {
    const captureId = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
    const capture = { ...currentWeekData, captureId, capturedAt, captureType:"scheduled-snapshot" };
    await db.collection(ROOT).doc("seasons").collection(season)
      .doc("weeks").collection(String(displayWeek)).doc("captures")
      .collection("items").doc(captureId).set(capture);
    await db.collection(ROOT).doc("seasons").collection(season)
      .doc("weeks").collection(String(displayWeek)).doc("latest")
      .set({ latestCaptureId:captureId, latestCapturedAt:capturedAt }, { merge:true });

    // Persist the first scheduled observation of a starter carrying a clearly
    // unavailable status. This avoids retroactively applying today's status to
    // old weeks when historical matchup data is fetched later.
    for (const team of currentWeekData.teams) {
      const starters = new Set((team.starters || []).map(String));
      const flagged = [...starters].map(playerId => ({ playerId, status:String(team.playerInfo?.[playerId]?.injuryStatus || '').toUpperCase() }))
        .filter(item => ["OUT","IR","SUSPENDED","PUP","NFI"].includes(item.status));
      if (flagged.length) {
        const ref = db.collection(ROOT).doc("seasons").collection(season).doc("weeks")
          .collection(String(displayWeek)).doc("availability").collection("items").doc(String(team.rosterId));
        await db.runTransaction(async tx => {
          const existing = await tx.get(ref);
          if (!existing.exists) tx.create(ref, { week:displayWeek, rosterId:team.rosterId, starters:team.starters, playerInfo:team.playerInfo, flagged, capturedAt, source:"scheduled-sleeper-snapshot" });
        });
      }
    }
  }

  const completedWeeks = weeklyData.filter(item => item.week < displayWeek);
  const availabilitySnapshots = [];
  for (const weekData of completedWeeks) {
    const snap = await db.collection(ROOT).doc("seasons").collection(season).doc("weeks")
      .collection(String(weekData.week)).doc("availability").collection("items").get();
    for (const doc of snap.docs) availabilitySnapshots.push(doc.data());
  }
  const teamDirectory = rosters.map(roster => {
    const user = userById.get(roster.owner_id) || {};
    const username = user.display_name || user.username || "Unknown";
    return {
      rosterId: roster.roster_id,
      username,
      managerName: NAME_TRANSLATOR[username] || username,
      teamName: asObject(user.metadata).team_name || NAME_TRANSLATOR[username] || username
    };
  });
  for (const team of teamDirectory) {
    await db.collection(ROOT).doc("seasons").collection(season).doc("teams")
      .collection("items").doc(String(team.rosterId)).set(team, { merge:true });
  }
  const scores = calculateSeasonScores(completedWeeks, teamDirectory, Array.isArray(league.roster_positions) ? league.roster_positions : [], availabilitySnapshots);
  const scoreboard = {
    schemaVersion: 1,
    leagueId: LEAGUE_ID,
    leagueName: league.name || "TCWR Dynasty",
    season,
    currentWeek: displayWeek,
    completedThroughWeek: displayWeek - 1,
    capturedAt,
    teamCount: scores.length,
    teams: scores
  };
  await db.collection(ROOT).doc("scoreboard").set(scoreboard);
  await db.collection(ROOT).doc("latest").set({
    season, week: displayWeek, capturedAt, teamCount: rosters.length,
    source: "sleeper-api", schemaVersion: 2
  }, { merge: true });

  console.log(JSON.stringify({
    ok: true, projectId: process.env.FIREBASE_PROJECT_ID || "from-service-account",
    leagueId: LEAGUE_ID, season, currentWeek: displayWeek,
    completedWeeksScored: completedWeeks.length,
    teamsScored: scores.length,
    categoryEventCounts: Object.fromEntries(["pointsLeftOnBench","betterPlayersBenched","inactivePlayersStarted","lineupEfficiency"].map(category => [category, scores.reduce((n, team) => n + team.evidence.filter(event => event.category === category).length, 0)])),
    scoringField,
    firestoreScoreboardPath: `${ROOT}/scoreboard`, capturedAt
  }, null, 2));
}

main().catch(error => { console.error("Tanking Meter collection/scoring failed:", error); process.exitCode = 1; });
