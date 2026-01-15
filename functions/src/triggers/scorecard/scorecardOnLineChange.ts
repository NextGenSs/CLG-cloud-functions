import { onValueWritten } from "firebase-functions/v2/database";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

import { FirestorePaths } from "../../constants/dbPaths";
import { RTDBPaths } from "../../constants/rtdbPaths";
import { getCurrentBattingTeamName, normalizeId } from "../../utils/helpers";
import { parseExtrasFromEvent } from "../../utils/overBallUtils";

const BATTERS = "batters";
const BOWLERS = "bowlers";
const PARTNERSHIP = "partnership";
const FALL_OF_WICKETS = "fallOfWickets";
const INNINGS = "innings";

export const scorecardOnLineChange = onValueWritten(
  "/line/{matchId}",
  async (event) => {
    const matchId = event.params.matchId;

    const before = event.data.before.val();
    const after = event.data.after.val();
    if (!after) return;

    // --------------------------------------------------
    // 🔴 EARLY DIFF GUARD (BILLING SAFE)
    // --------------------------------------------------
    const hasCricketChange =
      !before ||
      before.p1 !== after.p1 ||
      before.p2 !== after.p2 ||
      before.p1s !== after.p1s ||
      before.p2s !== after.p2s ||
      before.bs !== after.bs ||
      before.pt !== after.pt ||
      before.lw !== after.lw ||
      before.r !== after.r;

    if (!hasCricketChange) return;

    const rtdb = admin.database();
    const firestore = admin.firestore();

    // --------------------------------------------------
    // READ LINE (SOURCE OF TRUTH)
    // --------------------------------------------------
    const { p1, p2, p1s, p2s, b, bs, lw, r } = after;
    if (!p1 || !p1s || !b || !bs) return;

    // --------------------------------------------------
    // READ MATCH CARD
    // --------------------------------------------------
    const matchSnap = await rtdb
      .ref(RTDBPaths.matchCard(matchId))
      .once("value");

    const match = matchSnap.val();
    if (!match) return;

    const inning = Number(match.i);
    const scoreStr = match[`i${inning}`];
    if (!scoreStr) return;

    const [runsStr, oversStr] = scoreStr.split(",");
    const runs = Number(runsStr);
    const wickets = Number(match[`i${inning}w`] || 0);

    // --------------------------------------------------
    // FIRESTORE REFS
    // --------------------------------------------------
    const inningRef = firestore
      .doc(FirestorePaths.scorecardRoot(matchId))
      .collection(INNINGS)
      .doc(String(inning));

    const summaryRef = inningRef.collection("meta").doc("summary");
    const extrasRef = inningRef.collection("meta").doc("extras");
    const partnershipCurrentRef = inningRef.collection(PARTNERSHIP).doc("current");

    const writes: Promise<any>[] = [];

    // --------------------------------------------------
    // SUMMARY
    // --------------------------------------------------
    writes.push(
      summaryRef.set(
        {
          inning,
          team: getCurrentBattingTeamName(match),
          runs,
          wickets,
          overs: oversStr,
          updatedAt: Date.now(),
        },
        { merge: true }
      )
    );

    // --------------------------------------------------
    // BATTERS
    // --------------------------------------------------
    const [sr, sb, sf, ss] = String(p1s).split(",").map(Number);
    const strikerId = normalizeId(p1);

    writes.push(
      inningRef.collection(BATTERS).doc(strikerId).set(
        {
          name: p1,
          runs: sr,
          balls: sb,
          fours: sf,
          sixes: ss,
          isPlaying: true,
          updatedAt: Date.now(),
        },
        { merge: true }
      )
    );

    let nr = 0, nb = 0;

    if (p2 && p2s) {
      [nr, nb] = String(p2s).split(",").map(Number);
      writes.push(
        inningRef.collection(BATTERS).doc(normalizeId(p2)).set(
          {
            name: p2,
            runs: nr,
            balls: nb,
            fours: Number(p2s.split(",")[2]) || 0,
            sixes: Number(p2s.split(",")[3]) || 0,
            isPlaying: true,
            updatedAt: Date.now(),
          },
          { merge: true }
        )
      );
    }

    // --------------------------------------------------
    // BOWLER
    // --------------------------------------------------
    const [bOversStr, bRunsStr, bWicketsStr] = String(bs).split(",");
    const [ov, bl] = bOversStr.split(".");
    const totalBalls = Number(ov) * 6 + Number(bl);

    writes.push(
      inningRef.collection(BOWLERS).doc(normalizeId(b)).set(
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

    // --------------------------------------------------
    // EXTRAS
    // --------------------------------------------------
    const extrasDelta = parseExtrasFromEvent(r);
    if (extrasDelta.total > 0) {
      writes.push(
        extrasRef.set(
          {
            total: FieldValue.increment(extrasDelta.total),
            wides: FieldValue.increment(extrasDelta.wides),
            noBalls: FieldValue.increment(extrasDelta.noBalls),
            byes: FieldValue.increment(extrasDelta.byes),
            legByes: FieldValue.increment(extrasDelta.legByes),
            updatedAt: Date.now(),
          },
          { merge: true }
        )
      );
    }

    // --------------------------------------------------
    // LIVE PARTNERSHIP
    // --------------------------------------------------
    if (p2 && p2s) {
      writes.push(
        partnershipCurrentRef.set(
          {
            batter1: { name: p1, runs: sr, balls: sb },
            batter2: { name: p2, runs: nr, balls: nb },
            runs: sr + nr,
            balls: sb + nb,
            updatedAt: Date.now(),
          },
          { merge: true }
        )
      );
    }

    // --------------------------------------------------
    // FREEZE PARTNERSHIP + FALL OF WICKET
    // --------------------------------------------------
    if (lw && (!before || before.lw !== lw)) {
      const prevSr = before?.p1s ? Number(before.p1s.split(",")[0]) : 0;
      const prevSb = before?.p1s ? Number(before.p1s.split(",")[1]) : 0;
      const prevNr = before?.p2s ? Number(before.p2s.split(",")[0]) : 0;
      const prevNb = before?.p2s ? Number(before.p2s.split(",")[1]) : 0;

      const fowRef = inningRef.collection(FALL_OF_WICKETS).doc(String(wickets));
      const fowSnap = await fowRef.get();

      if (!fowSnap.exists) {
        writes.push(
          inningRef.collection(PARTNERSHIP).doc(`w${wickets}`).set({
            wicketNo: wickets,
            runs: prevSr + prevNr,
            balls: prevSb + prevNb,
            batter1: { name: before.p1, runs: prevSr, balls: prevSb },
            batter2: { name: before.p2, runs: prevNr, balls: prevNb },
            endOver: oversStr,
            endedAt: Date.now(),
          })
        );

        writes.push(
          fowRef.set({
            wicketNo: wickets,
            batter: lw,
            score: `${runs}-${wickets}`,
            over: oversStr,
            createdAt: Date.now(),
          })
        );
      }

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