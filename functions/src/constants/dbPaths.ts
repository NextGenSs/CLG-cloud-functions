export const FirestorePaths = {
  scorecardRoot: (matchId: string) =>
    `matches/${matchId}/scorecard/main`,

  scorecardInning: (matchId: string, inning: number | string) =>
    `matches/${matchId}/scorecard/main/innings/${inning}`,

  oddsRoot: (matchId: string) =>
    `matches/${matchId}/odds/main`,
};