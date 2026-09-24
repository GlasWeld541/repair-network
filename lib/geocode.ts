/**
 * Forward-geocode a free-text US location ("City, ST ZIP" or a street address) to coordinates,
 * using the server-side Mapbox token. Server-only: the token must never reach a browser bundle.
 *
 * Fails soft on every path — a missing token, a Mapbox error, no match — by returning null, so a
 * caller can always carry on without coordinates. A provider with no coordinates is still valid,
 * it just cannot be ranked by distance.
 */
export type Coordinates = { latitude: number; longitude: number };

export async function geocodeText(query: string): Promise<Coordinates | null> {
  const q = (query || '').trim();
  if (!q) return null;
  const token = process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&limit=1&country=US`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const center = data.features?.[0]?.center;
    if (!Array.isArray(center) || center.length !== 2) return null;
    return { latitude: Number(center[1]), longitude: Number(center[0]) };
  } catch {
    return null;
  }
}
