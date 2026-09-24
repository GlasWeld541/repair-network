import { NextResponse } from 'next/server';
import { geocodeText } from '@/lib/geocode';

// Forward-geocode a free-text location ("City, ST ZIP") to {latitude, longitude} using the
// server-side Mapbox token (same token the claim auto-router uses). Middleware requires an
// authenticated session to reach this route. Fails soft: any miss/error returns null coords
// (200) so the provider picker falls back to ZIP/city/state ranking instead of erroring.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q') || '';
  const coords = await geocodeText(q);
  return NextResponse.json(coords ?? { latitude: null, longitude: null });
}
