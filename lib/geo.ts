/**
 * Great-circle distance in miles (Haversine). Pure + client-safe — the same math the
 * claim auto-router uses to rank providers by proximity (app/api/claims/submit/route.ts).
 */
export function distanceMiles(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(destinationLat - originLat);
  const dLng = toRad(destinationLng - originLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(originLat)) *
      Math.cos(toRad(destinationLat)) *
      Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
