import { onValueWritten } from "firebase-functions/v2/database";
import * as admin from "firebase-admin";
import { isValidBall } from "../../utils/ballUtils";
import { FirestorePaths } from "../../constants/dbPaths";
import { RTDBPaths } from "../../constants/rtdbPaths";
import { getCurrentBattingTeamName, normalizeId } from "../../utils/helpers";

const BATTERS = "batters";
const BOWLERS = "bowlers";
const PARTNERSHIP = "partnership";
const fallOfWickets = "fallOfWickets";
const INNINGS = "innings";

export const scorecardOnBall = onValueWritten(
  "/line/{matchId}/r",
  async (event) => {
    const matchId = event.params.matchId;
    const newEvent = event.data.after.val();
    const oldEvent = event.data.before.val();
console.log("scorecardonBall", {matchId, newEvent, oldEvent})
    // ----------------------------------
    // Guards
    // ----------------------------------
    // if (!newEvent || newEvent === oldEvent) return;
    if (!isValidBall(newEvent)) return;

    const rtdb = admin.database();
    const firestore = admin.firestore();

    // ----------------------------------
    // Read RTDB LINE
    // ----------------------------------
    const lineSnap = await rtdb
      .ref(RTDBPaths.line(matchId))
      .once("value");

    const line = lineSnap.val();
    if (!line) return;

    const { p1, p2, p1s, p2s, b, bs } = line;
    if (!p1 || !p1s || !b || !bs) return;

    // ----------------------------------
    // Read MATCH CARD
    // ----------------------------------
    const matchSnap = await rtdb
      .ref(RTDBPaths.matchCard(matchId))
      .once("value");

    const match = matchSnap.val();
    if (!match) return;

    const inning = Number(match.i);
    const inningKey = `i${inning}`;
    const scoreStr = match[inningKey];
    if (!scoreStr) return;

    const [runsStr, oversStr] = scoreStr.split(",");
    const runs = Number(runsStr);
    const wickets = Number(match[`${inningKey}w`] || 0);

    // ----------------------------------
    // Firestore refs
    // ----------------------------------
    const scorecardRoot = firestore.doc(
      FirestorePaths.scorecardRoot(matchId)
    );

    const inningRef = scorecardRoot
      .collection(INNINGS)
      .doc(String(inning));

    const summaryRef = inningRef
      .collection("meta")
      .doc("summary");

    const partnershipCurrentRef = inningRef
      .collection(PARTNERSHIP)
      .doc("current");

    // ----------------------------------
    // Read EXISTING partnership/current
    // ----------------------------------
    const currentSnap = await partnershipCurrentRef.get();
    const prevPartnership = currentSnap.exists
      ? currentSnap.data()
      : null;

    const prevBatter1 = prevPartnership?.batter1?.name ?? null;
    const prevBatter2 = prevPartnership?.batter2?.name ?? null;

    const partnershipChanged =
      prevPartnership &&
      (prevBatter1 !== p1 || prevBatter2 !== p2);

    // ----------------------------------
    // IDs
    // ----------------------------------
    const strikerId = normalizeId(p1);
    const nonStrikerId = p2 ? normalizeId(p2) : null;
    const bowlerId = normalizeId(b);

    const writes: Promise<any>[] = [];

    // ----------------------------------
    // SUMMARY
    // ----------------------------------
    const xTeam = getCurrentBattingTeamName(match);
    console.log("current team: ", xTeam);
    writes.push(
      summaryRef.set(
        {
          inning,
          team: xTeam,
          runs,
          wickets,
          overs: oversStr,
          updatedAt: Date.now(),
        },
        { merge: true }
      )
    );

    // ----------------------------------
    // STRIKER
    // ----------------------------------
    const [sruns, sballs, sfours, ssixes] =
      String(p1s).split(",").map(Number);

    writes.push(
      inningRef.collection(BATTERS).doc(strikerId).set(
        {
          name: p1,
          runs: sruns,
          balls: sballs,
          fours: sfours,
          sixes: ssixes,
          isPlaying: true,
          updatedAt: Date.now(),
        },
        { merge: true }
      )
    );

    // ----------------------------------
    // NON-STRIKER
    // ----------------------------------
    let nruns = 0;
    let nballs = 0;

    if (p2 && p2s) {
      const parsed = String(p2s).split(",").map(Number);
      nruns = parsed[0] || 0;
      nballs = parsed[1] || 0;

      writes.push(
        inningRef.collection(BATTERS).doc(nonStrikerId!).set(
          {
            name: p2,
            runs: nruns,
            balls: nballs,
            fours: parsed[2] || 0,
            sixes: parsed[3] || 0,
            isPlaying: true,
            updatedAt: Date.now(),
          },
          { merge: true }
        )
      );
    }

    // ----------------------------------
    // BOWLER
    // ----------------------------------
    const [bOversStr, bRunsStr, bWicketsStr] =
      String(bs).split(",");

    const [ov, bl] = bOversStr.split(".");
    const totalBalls = Number(ov) * 6 + Number(bl);

    writes.push(
      inningRef.collection(BOWLERS).doc(bowlerId).set(
        {
          name: b,
          overs: bOversStr,
          balls: totalBalls,
          runs: Number(bRunsStr),
          wickets: Number(bWicketsStr),
          updatedAt: Date.now(),
        },
        { merge: true }
      )
    );

    // ----------------------------------
    // FREEZE PARTNERSHIP
    // ----------------------------------
    if (partnershipChanged && prevPartnership) {
      writes.push(
        inningRef
          .collection(PARTNERSHIP)
          .doc(`w${wickets}`)
          .set({
            wicketNo: wickets,
            runs: prevPartnership.runs,
            balls: prevPartnership.balls,
            batter1: prevPartnership.batter1,
            batter2: prevPartnership.batter2,
            endedAt: Date.now(),
            endOver: oversStr,
          })
      );
    }

    // ----------------------------------
    // LIVE PARTNERSHIP
    // ----------------------------------
    if (p2 && p2s) {
      writes.push(
        partnershipCurrentRef.set(
          {
            batter1: { name: p1, runs: sruns, balls: sballs },
            batter2: { name: p2, runs: nruns, balls: nballs },
            runs: sruns + nruns,
            balls: sballs + nballs,
            updatedAt: Date.now(),
          },
          { merge: true }
        )
      );
    }

    // ----------------------------------
    // WICKET
    // ----------------------------------
    if (newEvent.startsWith("W")) {
      writes.push(
        inningRef.collection(fallOfWickets).doc(String(wickets)).set({
          wicketNo: wickets,
          batter: p1,
          score: `${runs}-${wickets}`,
          over: oversStr,
          createdAt: Date.now(),
        })
      );

      writes.push(
        inningRef.collection(BATTERS).doc(strikerId).set(
          { isPlaying: false, updatedAt: Date.now() },
          { merge: true }
        )
      );
    }

    await Promise.all(writes);
  }
);