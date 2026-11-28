# TCWR Dynasty Tanking Meter — four-category build

This package is the completed local build for the separate `tankingmeter.html` page. It uses the existing Sleeper league and Firebase project. It does not modify the main league homepage or the existing commissioner-notification workflow.

## Approved score structure

| Category | Maximum | Scoring rule |
|---|---:|---|
| Points Left on Bench | 3.0 | +0.5 once per completed week when the highest-scoring bench player outscores the lowest-scoring starter by at least 10 actual points. |
| Better Players Benched | 3.0 | +0.5 once per completed week when a same-position bench player was projected at least 5 points higher than a starter. Suppressed for that week if Category 1 already flags a bench-versus-starter event, to reduce double-counting. |
| Inactive Players Started | 2.0 | +0.5 per week when a scheduled snapshot records a starter with an explicit unavailable status (OUT, IR, SUSPENDED, PUP, NFI). A snapshot is retained once per team/week. |
| Lineup Efficiency | 2.0 | +0.25 per completed week when an estimated legal optimal lineup outscores the submitted lineup by at least 15 points. |

Total score is capped at 10.0. Levels remain: 0.0–2.9 Normal; 3.0–4.9 Monitor; 5.0–6.9 Elevated Concern; 7.0–10.0 Red Alert / Commissioner Review.

## Data and limitations

- Weeks 1 through the current Sleeper display week are fetched. Only completed weeks are scored.
- Historical matchup data supplies submitted starters and actual player points.
- Category 2 uses Sleeper's undocumented projections endpoint. It can change without notice, and historical projections are not guaranteed to be a time-stamped copy of what a manager saw at lineup lock. Missing projection data means no Category 2 event for that week.
- Category 3 does **not** apply today's injury status retroactively to old matchups. It relies on a scheduled snapshot collected during that week. The snapshot is not a verified official inactive list or exact lineup-lock record; every flag requires commissioner review.
- Category 4 is retrospective. The estimated optimal lineup uses league roster slots, player positions, and final points. It does not prove intent or what was knowable before kickoff.
- Category 1 and Category 2 are not both awarded in the same team/week. Categories 3 and 4 remain separate screening signals and may appear in the same week.
- A score of 0 means no qualifying evidence was found in the data checked; it is not proof that tanking never occurred.
- The GitHub Actions schedule is best-effort and is not an exact 15-minute guarantee.

## Firestore writes

- `tankingMeter/scoreboard` — current season scoreboard consumed by the page.
- `tankingMeter/seasons/{season}/weeks/{week}/latest` — normalized weekly matchup data and latest-capture pointer.
- `tankingMeter/seasons/{season}/weeks/{week}/captures/items/{captureId}` — timestamped scheduled snapshots for the current week.
- `tankingMeter/seasons/{season}/weeks/{week}/availability/items/{rosterId}` — first scheduled observation of an explicitly unavailable starter, when detected.
- `tankingMeter/seasons/{season}/teams/items/{rosterId}` — team/manager directory.

## Test locally

From the `backend` directory:

```bash
npm test
node --check collect-sleeper.js
node --check score-tanking.js
```

The collector still requires the existing GitHub secret `FIREBASE_SERVICE_ACCOUNT_JSON`, plus the existing `FIREBASE_PROJECT_ID` and `SLEEPER_LEAGUE_ID` environment values. Do not paste or commit the service-account JSON.

## Deployment files

Replace these files in the existing repository with the matching files in this package:

- `backend/collect-sleeper.js`
- `backend/score-tanking.js`
- `backend/test-score-tanking.js`
- `backend/README.md`
- `tankingmeter.html` (repository root)

Keep the existing `backend/package.json`, `.github/workflows/tanking-meter-collector.yml`, `.github/workflows/send-commissioner-notification.yml`, Firebase project, and GitHub secrets unchanged.
