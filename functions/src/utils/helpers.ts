// ----------------------------------
// HELPERS

import { LineKeys } from "../constants/lineKeys";

// ----------------------------------
export function normalizeId(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function getBattingTeam(match: any) {
  const inning = match[LineKeys.INNING];
  if (inning === 1) return Number(match[LineKeys.INN_1_BAT]) || 1;
  if (inning === 2) {
    const first = Number(match[LineKeys.INN_1_BAT]) || 1;
    return first === 1 ? 2 : 1;
  }
  if (inning === 3) return Number(match[LineKeys.INN_3_BAT]) || 1;
  if (inning === 4) {
    const third = Number(match[LineKeys.INN_3_BAT]) || 1;
    return third === 1 ? 2 : 1;
  }
  return 1;
}

export function getCurrentBattingTeamName(match: any) {
  if (getBattingTeam(match) === 1) {
    return match[LineKeys.TEAM_A].split(",")[1]?.trim() || "";
  }
  return match[LineKeys.TEAM_B].split(",")[1]?.trim() || "";
}