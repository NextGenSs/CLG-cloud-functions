import { onValueWritten } from "firebase-functions/v2/database";
import * as admin from "firebase-admin";
import { ALLOWED_MATCH_FORMATS } from "../../constants/oddsConstants";
import { parseOverBall } from "../../utils/overBallUtils";

export const oddsOnBall = onValueWritten(
  "/line/{matchId}",
  async (event) => {
    const matchId = event.params.matchId;

    const after = event.data.after.val();
    if (!after) return;

    console.log(`[ODDS] LINE_TRIGGER match=${matchId}`);

    const db = admin.database();
    const firestore = admin.firestore();

    // ----------------------------------
    // READ MATCH CARD (BALL SOURCE OF TRUTH)
    // ----------------------------------
    const matchSnap = await db
      .ref(`/match_card/${matchId}`)
      .once("value");

    const match = matchSnap.val();
    if (!match) return;

    // ----------------------------------
    // FILTER MATCH FORMAT
    // ----------------------------------
    if (!ALLOWED_MATCH_FORMATS.includes(match.mf)) {
      console.log(`[ODDS] IGNORE_FORMAT match=${matchId}`);
      return;
    }

    // ----------------------------------
    // INNINGS & SCORE
    // ----------------------------------
    const innings = Number(match.i);
    const inningsKey = `i${innings}`;
    const inningsScore: string = match[inningsKey];

    if (!inningsScore) return;

    const [runsStr, oversStr] = inningsScore.split(",");
    const runs = Number(runsStr);

    const { over, ball } = parseOverBall(oversStr);
    const totalBalls = over * 6 + ball;

    const currentBallId = `${innings}_${over}_${ball}`;

    console.log(
      `[ODDS] BALL_DETECTED match=${matchId} ball=${currentBallId}`
    );

    // ----------------------------------
    // FIRESTORE PATHS
    // ----------------------------------
    const oddsMainRef = firestore.doc(
      `matches/${matchId}/odds/main`
    );

    const pendingRef = oddsMainRef
      .collection("pending")
      .doc("current");

    // ----------------------------------
    // READ PREVIOUS PENDING
    // ----------------------------------
    const pendingSnap = await pendingRef.get();

    if (pendingSnap.exists) {
      const prev = pendingSnap.data()!;
      const prevBallId = `${prev.innings}_${prev.score.over}_${prev.score.ball}`;

      // 🛑 DUPLICATE BALL GUARD
      if (prevBallId === currentBallId) {
        console.log(`[ODDS] DUPLICATE_BALL ${currentBallId}`);
        return;
      }

      // ----------------------------------
      // FLUSH TO HISTORY
      // ----------------------------------
      await oddsMainRef
        .collection("balls")
        .doc(prevBallId)
        .set(prev, { merge: false });

      console.log(
        `[ODDS] FLUSHED ball=${prevBallId}`
      );
    }

    // ----------------------------------
    // BUILD CURRENT SNAPSHOT
    // ----------------------------------
    const snapshot = {
      matchId,
      innings,

      score: {
        runs,
        over,
        ball,
        totalBalls
      },

      wickets: match[`${inningsKey}w`] ?? 0,
      event: after.r ?? null,
      timestamp: Date.now(),

      market: {
        sn: after.sn ?? null,
        lm: after.lm ?? null,
        rt: match.rt ?? null
      }
    };

    console.log(`[ODDS] SNAPSHOT_READY`, snapshot);

    // ----------------------------------
    // WRITE CURRENT → PENDING
    // ----------------------------------
    await pendingRef.set(snapshot);

    await oddsMainRef.set(
      { updatedAt: Date.now() },
      { merge: true }
    );

    console.log(
      `[ODDS] PENDING_WRITTEN match=${matchId} ball=${currentBallId}`
    );
  }
);