/** Placement rules shared by pointer and keyboard input. Distances are CSS pixels. */
export function selectMount(key, candidates, radius = Infinity) {
  const allowed = key === 'coat' || key === 'hat'
    ? ['rodLeft', 'rodRight']
    : key === 'bag' ? ['ring'] : key === 'rodLeft' || key === 'rodRight' ? ['body'] : [];
  return candidates
    .filter(candidate => allowed.includes(candidate.key) && candidate.available !== false && candidate.distance <= radius)
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

export function dropAction({ key, wasAttached, supportAttached, supportsOccupied, nearMount, outsideProduct, insideCanvas, moved }) {
  if (!moved || !insideCanvas) return 'return';
  if ((key === 'rodLeft' || key === 'rodRight') && supportsOccupied) return 'return';
  if ((key === 'coat' || key === 'hat') && !supportAttached) return 'return';
  if (nearMount) return 'attach';
  if (wasAttached && outsideProduct) return 'detach';
  return 'return';
}
export function placementMotion(t) {
  const p = Math.min(1, Math.max(0, t));
  if (p === 0 || p === 1) return { travel: p, lift: 0, sway: 0 };
  const travel = 1 - (1 - Math.min(p / .78, 1)) ** 3;
  const lift = p < .72 ? .065 * Math.sin(Math.PI * p / .72) : .006 * Math.sin((p - .72) / .28 * Math.PI * 2) * (1 - p) / .28;
  const sway = p < .65 ? 0 : .018 * Math.sin((p - .65) / .35 * Math.PI * 2) * (1 - p) / .35;
  return { travel, lift, sway };
}
