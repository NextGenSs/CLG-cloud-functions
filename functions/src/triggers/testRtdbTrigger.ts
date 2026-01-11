import { onValueWritten } from "firebase-functions/v2/database";

export const testRtdbTrigger = onValueWritten(
    "/test",
    (event) => {
        console.log("🔥 RTDB Trigger Fired");

        console.log("Before:", event.data.before.val());
        console.log("After:", event.data.after.val());

        return;
    }
);