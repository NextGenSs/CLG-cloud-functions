export function parseRt(rt?: string) {
  if (!rt) return null;
  const [fav, l, r] = rt.split(",");
  return {
    fav,
    left: Number(l),
    right: Number(r)
  };
}

export function parseSn(sn?: string) {
  if (!sn) return null;
  const [over, l, r] = sn.split(",");
  return {
    over: Number(over),
    left: Number(l),
    right: Number(r)
  };
}

export function parseLm(lm?: string) {
  if (!lm) return null;
  const [l, r] = lm.split(",");
  return {
    left: Number(l),
    right: Number(r)
  };
}