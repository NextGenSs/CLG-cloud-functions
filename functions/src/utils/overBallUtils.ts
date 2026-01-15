export function parseOverBall(overs?: string) {
  if (!overs) {
    return { over: 0, ball: 0 };
  }

  const [overStr, ballStr] = overs.split(".");
  return {
    over: Number(overStr),
    ball: Number(ballStr ?? 0)
  };
}

export function parseExtrasFromEvent(event?: string) {
  const e = String(event || "").toUpperCase();

  const delta = {
    total: 0,
    wides: 0,
    noBalls: 0,
    byes: 0,
    legByes: 0,
  };

  if (e.startsWith("WD")) {
    delta.wides += 1;
    delta.total += 1;
    const extraRuns = Number(e.replace("WD", "")) || 0;
    delta.total += extraRuns;
  } else if (e.startsWith("NB")) {
    delta.noBalls += 1;
    delta.total += 1;
    const extraRuns = Number(e.replace("NB", "")) || 0;
    delta.total += extraRuns;
  } else if (/^LB\d*$/.test(e)) {
    const runs = Number(e.replace("LB", "")) || 1;
    delta.legByes += runs;
    delta.total += runs;
  } else if (/^B\d*$/.test(e)) {
    const runs = Number(e.replace("B", "")) || 1;
    delta.byes += runs;
    delta.total += runs;
  }

  return delta;
}

export function isWicketEvent(event?: string) {
  const e = String(event || "").toUpperCase();
  if (!e) return false;

  if (e === "W" || e.startsWith("W")) return true;
  if (e === "WK" || e.startsWith("WK")) return true;
  if (e === "WDWK" || e === "NBWK") return true;

  return ["RO", "ST", "CO", "BO"].includes(e);
}

// export function parseExtrasFromEvent(event: string) {
//   let extras = {
//     total: 0,
//     wides: 0,
//     noBalls: 0,
//     byes: 0,
//     legByes: 0,
//   };

//   if (!event) return extras;

//   // WIDE
//   if (event.startsWith("WD")) {
//     extras.wides += 1;
//     extras.total += 1;

//     const runs = Number(event.replace("WD", "")) || 0;
//     extras.total += runs;
//   }

//   // NO BALL
//   if (event.startsWith("NB")) {
//     extras.noBalls += 1;
//     extras.total += 1;

//     const runs = Number(event.replace("NB", "")) || 0;
//     extras.total += runs;
//   }

//   // BYE
//   if (/^B\d*$/.test(event)) {
//     const runs = Number(event.replace("B", "")) || 1;
//     extras.byes += runs;
//     extras.total += runs;
//   }

//   // LEG BYE
//   if (/^LB\d*$/.test(event)) {
//     const runs = Number(event.replace("LB", "")) || 1;
//     extras.legByes += runs;
//     extras.total += runs;
//   }

//   return extras;
// }

// export function isWicketEvent(event: string): boolean {
//   if (!event) return false;

//   // Direct wicket formats
//   if (
//     event === "W" ||
//     event.startsWith("W") ||
//     event === "WK" ||
//     event.startsWith("WK")
//   ) {
//     return true;
//   }

//   // Wicket on illegal delivery
//   if (event === "WDWK" || event === "NBWK") {
//     return true;
//   }

//   // Explicit dismissal events
//   const OTHER_WICKETS = ["RO", "CO", "ST", "BO"];

//   if (OTHER_WICKETS.includes(event)) {
//     return true;
//   }

//   return false;
// }