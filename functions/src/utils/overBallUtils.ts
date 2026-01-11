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