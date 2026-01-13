import { onValueWritten } from "firebase-functions/v2/database";
import * as admin from "firebase-admin";
import { FirestorePaths } from "../../constants/dbPaths";
import { RTDBPaths } from "../../constants/rtdbPaths";
import { getCurrentBattingTeamName, normalizeId } from "../../utils/helpers";

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

        /**
         * ======================================================
         * 🔴 EARLY DIFF GUARD (VERY IMPORTANT FOR BILLING)
         * ======================================================
         */
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

        /**
         * ======================================================
         * READ LINE (SOURCE OF TRUTH)
         * ======================================================
         */
        const line = after;
        const { p1, p2, p1s, p2s, b, bs, lw } = line;

        if (!p1 || !p1s || !b || !bs) return;

        /**
         * ======================================================
         * READ MATCH CARD
         * ======================================================
         */
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

        /**
         * ======================================================
         * FIRESTORE REFS
         * ======================================================
         */
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

        /**
         * ======================================================
         * READ PREVIOUS PARTNERSHIP
         * ======================================================
         */
        const prevPartSnap = await partnershipCurrentRef.get();
        const prevPart = prevPartSnap.exists ? prevPartSnap.data() : null;

        const prevB1 = prevPart?.batter1?.name ?? null;
        const prevB2 = prevPart?.batter2?.name ?? null;

        const partnershipChanged =
            prevPart &&
            (prevB1 !== p1 || prevB2 !== p2);

        /**
         * ======================================================
         * IDS
         * ======================================================
         */
        const strikerId = normalizeId(p1);
        const nonStrikerId = p2 ? normalizeId(p2) : null;
        const bowlerId = normalizeId(b);

        const writes: Promise<any>[] = [];

        /**
         * ======================================================
         * SUMMARY
         * ======================================================
         */
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

        /**
         * ======================================================
         * STRIKER
         * ======================================================
         */
        const [sr, sb, sf, ss] =
            String(p1s).split(",").map(Number);

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

        /**
         * ======================================================
         * NON-STRIKER
         * ======================================================
         */
        let nr = 0;
        let nb = 0;

        if (p2 && p2s && nonStrikerId) {
            const parsed = String(p2s).split(",").map(Number);
            nr = parsed[0] || 0;
            nb = parsed[1] || 0;

            writes.push(
                inningRef.collection(BATTERS).doc(nonStrikerId).set(
                    {
                        name: p2,
                        runs: nr,
                        balls: nb,
                        fours: parsed[2] || 0,
                        sixes: parsed[3] || 0,
                        isPlaying: true,
                        updatedAt: Date.now(),
                    },
                    { merge: true }
                )
            );
        }

        /**
         * ======================================================
         * BOWLER
         * ======================================================
         */
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

        /**
         * ======================================================
         * FREEZE PARTNERSHIP (ON CHANGE)
         * ======================================================
         */
        if (partnershipChanged && prevPart) {
            writes.push(
                inningRef
                    .collection(PARTNERSHIP)
                    .doc(`w${wickets}`)
                    .set({
                        wicketNo: wickets,
                        runs: prevPart.runs,
                        balls: prevPart.balls,
                        batter1: prevPart.batter1,
                        batter2: prevPart.batter2,
                        endedAt: Date.now(),
                        endOver: oversStr,
                    })
            );
        }

        /**
         * ======================================================
         * LIVE PARTNERSHIP
         * ======================================================
         */
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

        /**
         * ======================================================
         * FALL OF WICKET
         * ======================================================
         */
        if (lw && (!before || before.lw !== lw)) {
            writes.push(
                inningRef
                    .collection(FALL_OF_WICKETS)
                    .doc(String(wickets))
                    .set({
                        wicketNo: wickets,
                        batter: lw,
                        score: `${runs}-${wickets}`,
                        over: oversStr,
                        createdAt: Date.now(),
                    })
            );

            // Mark striker as out
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