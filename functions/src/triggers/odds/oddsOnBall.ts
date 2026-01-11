import { onValueWritten } from "firebase-functions/v2/database";
import * as admin from "firebase-admin";
import { ALLOWED_MATCH_FORMATS } from "../../constants/oddsConstants";
import { isValidBall } from "../../utils/ballUtils";
import { parseOverBall } from "../../utils/overBallUtils";

export const oddsOnBall = onValueWritten(
  "/line/{matchId}/r",
  async (event) => {
    const matchId = event.params.matchId;
    const newEvent = event.data.after.val();
    const oldEvent = event.data.before.val();

    // 🔹 Ignore empty / duplicate RTDB writes
    if (!newEvent || newEvent === oldEvent) return;

    const isBall = isValidBall(newEvent);

    console.log(
      `[ODDS] BALL_CHECK match=${matchId} event=${newEvent} valid=${isBall}`
    );

    // 🔹 Read match_card
    const matchSnap = await admin
      .database()
      .ref(`/match_card/${matchId}`)
      .once("value");

    const match = matchSnap.val();
    if (!match) return;

    // 🔹 Filter match format (T20 / ODI / T10 only)
    if (!ALLOWED_MATCH_FORMATS.includes(match.mf)) {
      console.log(`[ODDS] IGNORE match=${matchId} mf=${match.mf}`);
      return;
    }

    // 🔹 Innings & score parsing (RTDB stays unchanged)
    const innings = match.i;
    const inningsKey = `i${innings}`;
    const inningsScore: string = match[inningsKey];
    if (!inningsScore) return;

    const [runsStr, oversStr] = inningsScore.split(",");
    const runs = Number(runsStr);

    const { over, ball } = parseOverBall(oversStr);
    const totalBalls = (over * 6) + ball;

    console.log(
      `[ODDS] OVER_BALL match=${matchId} innings=${innings} over=${over} ball=${ball}`
    );

    const currentBallId = buildBallId(innings, over, ball);

    // 🔹 Read line snapshot
    const lineSnap = await admin
      .database()
      .ref(`/line/${matchId}`)
      .once("value");

    const line = lineSnap.val();

    // 🔹 Firestore
    const firestore = admin.firestore();

    /**
     * ======================================================
     *  odds/main DOCUMENT (fixed Firestore hierarchy)
     * ======================================================
     */
    const oddsMainRef = firestore.doc(
      `matches/${matchId}/odds/main`
    );

    // Minimal write, merged (cheap)
    await oddsMainRef.set(
      { updatedAt: Date.now() },
      { merge: true }
    );

    // 🔹 Pending (1-ball buffer)
    const pendingRef = oddsMainRef
      .collection("pending")
      .doc("current");

    const pendingSnap = await pendingRef.get();

    /**
     * ======================================================
     *  FLUSH PREVIOUS PENDING → HISTORY
     * ======================================================
     */
    if (pendingSnap.exists) {
      const prev = pendingSnap.data()!;
      const prevBallId = buildBallId(
        prev.innings,
        prev.score.over,
        prev.score.ball
      );

      // 🛑 Dedup guard
      if (prevBallId === currentBallId) {
        console.log(
          `[ODDS] DUPLICATE_BALL match=${matchId} ball=${currentBallId}`
        );
        return;
      }

      const historyRef = oddsMainRef
        .collection("balls")
        .doc(prevBallId);

      // Immutable history write
      await historyRef.set(prev, { merge: false });

      console.log(
        `[ODDS] FLUSHED_TO_HISTORY match=${matchId} ball=${prevBallId}`
      );
    } else {
      console.log(`[ODDS] NO_PENDING match=${matchId}`);
    }

    /**
     * ======================================================
     *  BUILD CURRENT SNAPSHOT (NORMALIZED)
     * ======================================================
     */
    if (!isBall) {
      console.log(
        `[ODDS] NON_VALID_BALL match=${matchId} event=${newEvent}`
      );
      return;
    }

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
      event: newEvent,
      timestamp: Date.now(),

      market: {
        sn: line?.sn ?? null,
        lm: line?.lm ?? null,
        rt: match?.rt ?? null
      }
    };

    console.log(`[ODDS] SNAPSHOT_READY`, snapshot);

    /**
     * ======================================================
     *  WRITE CURRENT SNAPSHOT → PENDING
     * ======================================================
     */
    await pendingRef.set(snapshot);

    console.log(
      `[ODDS] PENDING_WRITTEN match=${matchId} ball=${currentBallId}`
    );
  }
);

/**
 * ======================================================
 *  HELPERS
 * ======================================================
 */
function buildBallId(
  innings: number | string,
  over: number,
  ball: number
) {
  return `${innings}_${over}_${ball}`;
}