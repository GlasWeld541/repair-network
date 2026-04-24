'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Layer,
  NavigationControl,
  Popup,
  Source,
  type LayerProps,
  type MapMouseEvent,
  type MapRef,
  type LngLatBoundsLike,
} from '@vis.gl/react-mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ExternalLink, MapPinned } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AccountMapRow = {
  id: string;
  account_name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  company_phone: string | null;
  company_email: string | null;
  latitude: number | null;
  longitude: number | null;
  glasweld_certified: string | null;
  insurance: string | null;
  uses_onyx: string | null;
  uses_zoom_injector: string | null;
  repair_only: string | null;
  outreach_status: string | null;
};

type PopupAccount = AccountMapRow & {
  qualificationStatus: 'red' | 'yellow' | 'green';
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

const ACCOUNT_SELECT =
  'id, account_name, street, city, state, postal_code, company_phone, company_email, latitude, longitude, glasweld_certified, insurance, uses_onyx, uses_zoom_injector, repair_only, outreach_status';

const clusterLayer: LayerProps = {
  id: 'clusters',
  type: 'circle',
  source: 'accounts',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#0f172a',
    'circle-radius': ['step', ['get', 'point_count'], 20, 25, 24, 100, 30],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
  },
};

const clusterCountLayer: LayerProps = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'accounts',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-size': 12,
  },
  paint: {
    'text-color': '#ffffff',
  },
};

const unclusteredLayer: LayerProps = {
  id: 'unclustered-point',
  type: 'circle',
  source: 'accounts',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-radius': 8,
    'circle-color': [
      'match',
      ['get', 'qualificationStatus'],
      'green',
      '#16a34a',
      'yellow',
      '#eab308',
      '#dc2626',
    ],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
  },
};

function getQualificationStatus(row: AccountMapRow): 'red' | 'yellow' | 'green' {
  const coreChecks = [
    row.glasweld_certified === 'Yes',
    row.uses_onyx === 'Yes',
    row.uses_zoom_injector === 'Yes',
    row.repair_only === 'Yes',
  ];

  const coreYesCount = coreChecks.filter(Boolean).length;

  const hasStrongEngagement =
    row.outreach_status === 'Qualified' || row.outreach_status === 'Onboarded';

  if (coreYesCount === 4) return 'green';

  if (coreYesCount >= 2 || hasStrongEngagement) return 'yellow';

  return 'red';
}

function buildBounds(rows: AccountMapRow[]): LngLatBoundsLike | null {
  const points = rows
    .filter(
      (row) =>
        typeof row.longitude === 'number' && typeof row.latitude === 'number'
    )
    .map((row) => [row.longitude as number, row.latitude as number]);

  if (!points.length) return null;

  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);

  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ] as LngLatBoundsLike;
}

async function geocodeAddress(row: AccountMapRow) {
  if (!MAPBOX_TOKEN) return null;
  if (!row.street || !row.city || !row.state) return null;

  const query = encodeURIComponent(
    [row.street, row.city, row.state, row.postal_code]
      .filter(Boolean)
      .join(', ')
  );

  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=US`
  );

  if (!response.ok) return null;

  const data = (await response.json()) as {
    features?: Array<{ center?: [number, number] }>;
  };

  const center = data.features?.[0]?.center;
  if (!center || center.length !== 2) return null;

  return {
    longitude: center[0],
    latitude: center[1],
  };
}

export default function HomeCoverageMap() {
  const mapRef = useRef<MapRef | null>(null);
  const geocodingInProgress = useRef<Set<string>>(new Set());

  const [allAccounts, setAllAccounts] = useState<AccountMapRow[]>([]);
  const [visibleAccounts, setVisibleAccounts] = useState<AccountMapRow[]>([]);
  const [popupAccount, setPopupAccount] = useState<PopupAccount | null>(null);
  const [hasFit, setHasFit] = useState(false);

  const loadMappedAccounts = useCallback(async () => {
    const { data } = await supabase
      .from('accounts')
      .select(ACCOUNT_SELECT)
      .not('street', 'is', null)
      .not('city', 'is', null)
      .not('state', 'is', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    setAllAccounts((data as AccountMapRow[]) ?? []);
  }, []);

  const backfillCoordinates = useCallback(async () => {
    if (!MAPBOX_TOKEN) return;

    const { data } = await supabase
      .from('accounts')
      .select(ACCOUNT_SELECT)
      .not('street', 'is', null)
      .not('city', 'is', null)
      .not('state', 'is', null)
      .is('latitude', null)
      .is('longitude', null)
      .limit(100);

    const rows = ((data as AccountMapRow[]) ?? []).filter(
      (row) => !geocodingInProgress.current.has(row.id)
    );

    if (!rows.length) return;

    await Promise.all(
      rows.map(async (row) => {
        geocodingInProgress.current.add(row.id);

        try {
          const coords = await geocodeAddress(row);
          if (!coords) return;

          await supabase.from('accounts').update(coords).eq('id', row.id);
        } finally {
          geocodingInProgress.current.delete(row.id);
        }
      })
    );
  }, []);

  const loadVisibleAccounts = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const bounds = map.getBounds();
    if (!bounds) return;

    const { data } = await supabase
      .from('accounts')
      .select(ACCOUNT_SELECT)
      .not('street', 'is', null)
      .not('city', 'is', null)
      .not('state', 'is', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('longitude', bounds.getWest())
      .lte('longitude', bounds.getEast())
      .gte('latitude', bounds.getSouth())
      .lte('latitude', bounds.getNorth());

    setVisibleAccounts((data as AccountMapRow[]) ?? []);
  }, []);

  useEffect(() => {
    void backfillCoordinates();
    void loadMappedAccounts();

    const channel = supabase
      .channel('home-coverage-map')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts' },
        async () => {
          await backfillCoordinates();
          await loadMappedAccounts();
          await loadVisibleAccounts();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [backfillCoordinates, loadMappedAccounts, loadVisibleAccounts]);

  useEffect(() => {
    if (!mapRef.current || hasFit || !allAccounts.length) return;

    const bounds = buildBounds(allAccounts);
    if (!bounds) return;

    mapRef.current.fitBounds(bounds, {
      padding: { top: 35, right: 35, bottom: 35, left: 35 },
      duration: 1000,
    });

    setHasFit(true);

    setTimeout(() => {
      void loadVisibleAccounts();
    }, 1100);
  }, [allAccounts, hasFit, loadVisibleAccounts]);

  const featureCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: visibleAccounts
        .filter(
          (row) =>
            typeof row.longitude === 'number' &&
            typeof row.latitude === 'number'
        )
        .map((row) => ({
          type: 'Feature' as const,
          properties: {
            id: row.id,
            qualificationStatus: getQualificationStatus(row),
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [row.longitude as number, row.latitude as number],
          },
        })),
    }),
    [visibleAccounts]
  );

  const handleClusterClick = useCallback((event: MapMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature || feature.geometry.type !== 'Point') return;

    const coordinates = feature.geometry.coordinates as [number, number];
    const clusterId = feature.properties?.cluster_id;

    const source = mapRef.current?.getSource('accounts') as
      | {
          getClusterExpansionZoom?: (
            clusterId: number,
            callback: (error: Error | null, zoom: number) => void
          ) => void;
        }
      | undefined;

    if (!source?.getClusterExpansionZoom || typeof clusterId !== 'number') {
      return;
    }

    source.getClusterExpansionZoom(clusterId, (error, zoom) => {
      if (error || !mapRef.current) return;

      mapRef.current.easeTo({
        center: coordinates,
        zoom,
        duration: 500,
      });
    });
  }, []);

  const handlePointClick = useCallback(
    (event: MapMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;

      const account = visibleAccounts.find(
        (row) => row.id === feature.properties?.id
      );

      if (!account) return;

      setPopupAccount({
        ...account,
        qualificationStatus: getQualificationStatus(account),
      });
    },
    [visibleAccounts]
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-[440px] items-center justify-center rounded-[28px] border border-amber-200 bg-amber-50 p-8 text-center">
        <div>
          <div className="text-lg font-semibold text-amber-950">
            Mapbox token missing
          </div>
          <p className="mt-2 text-sm text-amber-900">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to your .env.local file and Vercel
            environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Repair coverage map
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Live qualified repair footprint
          </div>
        </div>

        <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
          {allAccounts.length} mapped businesses
        </div>
      </div>

      <div className="relative h-[440px]">
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{
            longitude: -98.5795,
            latitude: 39.8283,
            zoom: 3,
          }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          reuseMaps
          interactiveLayerIds={['clusters', 'unclustered-point']}
          onIdle={() => {
            void loadVisibleAccounts();
          }}
          onClick={(event) => {
            const feature = event.features?.[0];

            if (!feature) {
              setPopupAccount(null);
              return;
            }

            if (feature.layer.id === 'clusters') {
              handleClusterClick(event);
              return;
            }

            if (feature.layer.id === 'unclustered-point') {
              handlePointClick(event);
            }
          }}
        >
          <NavigationControl position="top-right" />

          <Source
            id="accounts"
            type="geojson"
            data={featureCollection}
            cluster
            clusterMaxZoom={14}
            clusterRadius={55}
          >
            <Layer {...clusterLayer} />
            <Layer {...clusterCountLayer} />
            <Layer {...unclusteredLayer} />
          </Source>

          {popupAccount && popupAccount.longitude && popupAccount.latitude ? (
            <Popup
              longitude={popupAccount.longitude}
              latitude={popupAccount.latitude}
              anchor="bottom"
              onClose={() => setPopupAccount(null)}
              closeButton
              maxWidth="320px"
            >
              <div className="space-y-3 p-1">
                <div>
                  <div className="text-base font-semibold text-slate-900">
                    {popupAccount.account_name}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {[
                      popupAccount.street,
                      popupAccount.city,
                      popupAccount.state,
                      popupAccount.postal_code,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                </div>

                <div className="space-y-1 text-sm text-slate-700">
                  {popupAccount.company_phone ? (
                    <div>{popupAccount.company_phone}</div>
                  ) : null}
                  {popupAccount.company_email ? (
                    <div>{popupAccount.company_email}</div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className={[
                      'h-2.5 w-2.5 rounded-full',
                      popupAccount.qualificationStatus === 'green'
                        ? 'bg-green-600'
                        : popupAccount.qualificationStatus === 'yellow'
                          ? 'bg-yellow-500'
                          : 'bg-red-600',
                    ].join(' ')}
                  />
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    {popupAccount.qualificationStatus === 'green'
                      ? 'Insurance-ready'
                      : popupAccount.qualificationStatus === 'yellow'
                        ? 'In progress'
                        : 'Needs review'}
                  </span>
                </div>

                <Link
                  href={`/accounts/${popupAccount.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Open account
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </Popup>
          ) : null}
        </Map>

        <div className="pointer-events-none absolute bottom-4 left-4 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <MapPinned className="h-4 w-4 text-slate-500" />
            Zoom to street level and inspect live repair coverage.
          </div>

          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-600" />
              Insurance-ready
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
              In progress
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
              Needs review
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}