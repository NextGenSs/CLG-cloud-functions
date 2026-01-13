import * as admin from "firebase-admin";

admin.initializeApp();

export { oddsOnBall } from "./triggers/odds/oddsOnBall";
export { scorecardOnLineChange } from "./triggers/scorecard/scorecardOnLineChange"


// export { scorecardOnBall } from "./triggers/scorecard/scorecardOnBall";

// firebase emulators:start --only functions,database

// firebase emulators:start \
//   --only functions,database \
//   --import=./emulator-data \
//   --export-on-exit