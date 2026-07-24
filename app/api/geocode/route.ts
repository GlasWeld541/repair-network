import { NextResponse } from 'next/server';

// Forward-geocode a free-text location ("City, ST ZIP") to {latitude, longitude} using the
// server-side Mapbox token (same token the claim auto-router uses). Middleware requires an
// authenticated session to reach this route. Fails soft: any miss/error returns null coords
// (200) so the provider picker falls back to ZIP/city/state ranking instead of erroring.
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ latitude: null, longitude: null });

  const token = process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  if (!token) return NextResponse.json({ latitude: null, longitude: null });

  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        q
      )}.json?access_token=${token}&limit=1&country=US`
    );
    if (!res.ok) return NextResponse.json({ latitude: null, longitude: null });

    const data = await res.json();
    const center = data.features?.[0]?.center;
    if (!Array.isArray(center) || center.length !== 2) {
      return NextResponse.json({ latitude: null, longitude: null });
    }

    return NextResponse.json({
      latitude: Number(center[1]),
      longitude: Number(center[0]),
    });
  } catch {
    return NextResponse.json({ latitude: null, longitude: null });
  }
}
