import { NON_BALL_EVENTS } from "../constants/oddsConstants";

export function isValidBall(event: string): boolean {
  return !NON_BALL_EVENTS.includes(event);
}

export function buildBallId(
  innings: number,
  over: number,
  ball: number
): string {
  return `${innings}_${over}_${ball}`;
}