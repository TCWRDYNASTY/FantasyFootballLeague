/** TCWR Dynasty Tanking Meter scoring engine. Sleeper-only, conservative evidence rules. */
export const SCORE_WEIGHTS = Object.freeze({ pointsLeftOnBench: 3, betterPlayersBenched: 3, inactivePlayersStarted: 2, lineupEfficiency: 2 });
export const TOTAL_SCORE_CAP = 10;
export const RED_ALERT_THRESHOLD = 7;
const round1 = n => Math.round((Number(n) + Number.EPSILON) * 10) / 10;
const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
const cleanId = v => String(v ?? '').trim();

export function analyzePointsLeftOnBench(team, week) {
  const starters = (team.starters || []).map(cleanId).filter(Boolean);
  const points = team.playerPoints || {};
  const starterRows = starters.map(id => ({ playerId:id, points:num(points[id]) })).filter(x => x.points !== null);
  const starterSet = new Set(starters);
  const benchRows = Object.entries(points).filter(([id]) => id && !starterSet.has(String(id)))
    .map(([playerId, p]) => ({ playerId:String(playerId), points:num(p) })).filter(x => x.points !== null);
  if (!starterRows.length || !benchRows.length) return { qualified:false, week, reason:'Insufficient starter or bench scoring data.' };
  const bestBench = benchRows.reduce((a,b) => b.points > a.points ? b : a);
  const lowestStarter = starterRows.reduce((a,b) => b.points < a.points ? b : a);
  const gap = round1(bestBench.points - lowestStarter.points);
  if (gap < 10) return { qualified:false, week, pointDifference:gap, reason:`Largest bench-to-starter gap was ${gap.toFixed(1)}; 10.0 required.` };
  return { qualified:true, category:'pointsLeftOnBench', week, pointsAwarded:0.5, bestBenchPlayerId:bestBench.playerId, bestBenchPoints:bestBench.points, lowestStarterPlayerId:lowestStarter.playerId, lowestStarterPoints:lowestStarter.points, pointDifference:gap, reason:`A bench player scored ${gap.toFixed(1)} more points than the lowest-scoring starter.`, caveat:'Retrospective comparison; this alone does not establish what the manager knew at lineup lock.' };
}

const normalizePosition = p => ({PK:'K', DST:'DEF'}[String(p || '').toUpperCase()] || String(p || '').toUpperCase());
function canFill(player, slot) {
  const p = normalizePosition(player.position);
  const s = String(slot).toUpperCase();
  if (s === 'FLEX') return ['RB','WR','TE'].includes(p);
  if (s === 'REC_FLEX') return ['WR','TE'].includes(p);
  if (s === 'SUPER_FLEX') return ['QB','RB','WR','TE'].includes(p);
  if (s === 'IDP_FLEX') return ['DL','LB','DB'].includes(p);
  if (s === 'WRRB_FLEX') return ['RB','WR'].includes(p);
  if (s === 'DL' || s === 'LB' || s === 'DB') return p === s;
  return normalizePosition(s) === p;
}

// Scarce positions are assigned before flexible slots to avoid using an RB in FLEX
// when the roster has no other RB for the RB slot.
export function estimateOptimalLineup(team, rosterPositions = []) {
  const points = team.playerPoints || {};
  const meta = team.playerInfo || {};
  const players = Object.entries(points).map(([id, pts]) => ({ id:String(id), points:num(pts), position:meta[id]?.position }))
    .filter(p => p.points !== null && p.position && !['0',''].includes(p.id));
  const slots = [];
  for (const slot of rosterPositions) {
    if (slot === 'BN' || slot === 'IR' || slot === 'TAXI') continue;
    if (typeof slot === 'string') slots.push(slot);
    else if (slot && typeof slot === 'object') {
      const key = Object.keys(slot)[0];
      const count = Number(slot[key]) || 0;
      for (let i=0;i<count;i++) slots.push(key);
    }
  }
  if (!slots.length || !players.length) return null;
  const orderedSlots = slots.sort((a,b) => {
    const count = s => players.filter(p => canFill(p,s)).length;
    return count(a)-count(b);
  });
  const used = new Set(); let total = 0; const chosen = [];
  for (const slot of orderedSlots) {
    const pick = players.filter(p => !used.has(p.id) && canFill(p,slot)).sort((a,b)=>b.points-a.points)[0];
    if (pick) { used.add(pick.id); total += pick.points; chosen.push({ playerId:pick.id, position:pick.position, points:pick.points, slot }); }
  }
  return { points:round1(total), players:chosen, slotsFilled:chosen.length, slotsRequired:slots.length };
}

function category2(team, week) {
  const starters = new Set((team.starters || []).map(String));
  const info = team.playerInfo || {};
  const projections = team.projections || {};
  const candidates = [];
  for (const [benchId, proj] of Object.entries(projections)) {
    if (starters.has(String(benchId)) || num(proj.points) === null || !info[benchId]?.position) continue;
    for (const starterId of starters) {
      const starterProj = projections[starterId];
      if (!starterProj || num(starterProj.points) === null || !info[starterId]?.position) continue;
      if (normalizePosition(info[benchId].position) !== normalizePosition(info[starterId].position)) continue;
      const gap = round1(Number(proj.points) - Number(starterProj.points));
      if (gap >= 5) candidates.push({ benchId, starterId, benchProjection:Number(proj.points), starterProjection:Number(starterProj.points), gap });
    }
  }
  candidates.sort((a,b)=>b.gap-a.gap);
  const best = candidates[0];
  if (!best) return null;
  return { category:'betterPlayersBenched', week, pointsAwarded:0.5, ...best, reason:`At the weekly projection snapshot, ${best.benchId} was projected ${best.gap.toFixed(1)} points higher than starting ${best.starterId} at the same position.`, caveat:'Sleeper projection endpoint is undocumented; historical projection data is not guaranteed to be a time-stamped copy of what the manager saw at lineup lock.' };
}

function category3(snapshot, week) {
  if (!snapshot) return null;
  const starters = new Set((snapshot.starters || []).map(String));
  const info = snapshot.playerInfo || {};
  const unavailable = [];
  for (const id of starters) {
    const status = String(info[id]?.injuryStatus || '').toUpperCase();
    if (['OUT','IR','SUSPENDED','PUP','NFI'].includes(status)) unavailable.push({ playerId:id, status });
  }
  if (!unavailable.length) return null;
  return { category:'inactivePlayersStarted', week, pointsAwarded:0.5, observedAt:snapshot.capturedAt || null, players:unavailable, reason:`A scheduled Sleeper snapshot recorded a starter with unavailable status: ${unavailable.map(x=>`${x.playerId}: ${x.status}`).join(', ')}.`, caveat:'The status was observed in a scheduled snapshot, not independently verified against the official inactive list or exact lineup-lock time. Commissioner review is required.' };
}

function category4(team, week, rosterPositions) {
  const optimal = estimateOptimalLineup(team, rosterPositions);
  if (!optimal) return null;
  const actual = round1((team.starters || []).reduce((sum,id)=>sum+(num(team.playerPoints?.[id]) ?? 0),0));
  const gap = round1(optimal.points - actual);
  if (gap < 15) return null;
  return { category:'lineupEfficiency', week, pointsAwarded:0.25, actualStarterPoints:actual, optimalLineupPoints:optimal.points, pointDifference:gap, optimalPlayers:optimal.players, reason:`Estimated legal lineup scored ${gap.toFixed(1)} more points than the submitted lineup.`, caveat:'Optimal lineup is a retrospective calculation using final points and league roster slots; it does not establish intent or what was knowable at lineup lock.' };
}

export function calculateSeasonScores(weeklyData, teamDirectory = [], rosterPositions = [], availabilitySnapshots = []) {
  const teams = new Map(teamDirectory.map(t => [String(t.rosterId), { rosterId:t.rosterId, managerName:t.managerName || t.teamName || `Team ${t.rosterId}`, username:t.username || '', categories:{pointsLeftOnBench:0,betterPlayersBenched:0,inactivePlayersStarted:0,lineupEfficiency:0}, evidence:[], flags:[] }]));
  for (const weekData of weeklyData) for (const team of weekData.teams || []) {
    const id = String(team.rosterId);
    if (!teams.has(id)) teams.set(id,{rosterId:team.rosterId,managerName:team.managerName || team.teamName || `Team ${id}`,username:team.username || '',categories:{pointsLeftOnBench:0,betterPlayersBenched:0,inactivePlayersStarted:0,lineupEfficiency:0},evidence:[],flags:[]});
    const out = teams.get(id);
    const c1 = analyzePointsLeftOnBench(team, weekData.week);
    if (c1.qualified) { out.categories.pointsLeftOnBench += c1.pointsAwarded; out.evidence.push(c1); }
    // Avoid awarding Category 2 for a week already flagged by the same retrospective
    // bench-vs-starter event in Category 1.
    const c2 = c1.qualified ? null : category2(team, weekData.week);
    if (c2) { out.categories.betterPlayersBenched += c2.pointsAwarded; out.evidence.push(c2); }
    const statusSnapshot = availabilitySnapshots.find(s => Number(s.week) === Number(weekData.week) && String(s.rosterId) === id);
    const c3 = category3(statusSnapshot, weekData.week);
    if (c3) { out.categories.inactivePlayersStarted += c3.pointsAwarded; out.evidence.push(c3); }
    const c4 = category4(team, weekData.week, rosterPositions);
    if (c4) { out.categories.lineupEfficiency += c4.pointsAwarded; out.evidence.push(c4); }
  }
  return [...teams.values()].map(t => {
    for (const key of Object.keys(t.categories)) t.categories[key] = round1(Math.min(SCORE_WEIGHTS[key],t.categories[key]));
    const total = round1(Math.min(TOTAL_SCORE_CAP,Object.values(t.categories).reduce((a,b)=>a+b,0)));
    return {...t,total,level:total>=7?'Red Alert':total>=5?'Elevated Concern':total>=3?'Monitor':'Normal',evidence:t.evidence.sort((a,b)=>a.week-b.week)};
  }).sort((a,b)=>Number(a.rosterId)-Number(b.rosterId));
}
