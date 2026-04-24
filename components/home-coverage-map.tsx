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
    row.outreach_status === 'Qualified' ||
    row.outreach_status === 'Onboarded';

  if (coreYesCount === 4) return 'green';
  if (coreYesCount >= 2 || hasStrongEngagement) return 'yellow';

  return 'red';
}

function buildBounds(rows: AccountMapRow[]): LngLatBoundsLike | null {
  const points = rows
    .filter(
      (row) =>
        typeof row.longitude === 'number' &&
        typeof row.latitude === 'number'
    )
    .map((row) => [row.longitude as number, row.latitude as number]);

  if (!points.length) return null;

  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);

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

  const data = await response.json();
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
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    setAllAccounts((data as AccountMapRow[]) ?? []);
  }, []);

  const backfillCoordinates = useCallback(async () => {
    if (!MAPBOX_TOKEN) return;

    const { data } = await supabase
      .from('accounts')
      .select(ACCOUNT_SELECT)
      .is('latitude', null)
      .is('longitude', null)
      .limit(50);

    const rows = (data as AccountMapRow[]) ?? [];

    await Promise.all(
      rows.map(async (row) => {
        if (geocodingInProgress.current.has(row.id)) return;

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

    const { data } = await supabase
      .from('accounts')
      .select(ACCOUNT_SELECT)
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
  }, [backfillCoordinates, loadMappedAccounts]);

  useEffect(() => {
    if (!mapRef.current || hasFit || !allAccounts.length) return;

    const bounds = buildBounds(allAccounts);
    if (!bounds) return;

    mapRef.current.fitBounds(bounds, {
      padding: 40,
      duration: 1000,
    });

    setHasFit(true);
  }, [allAccounts, hasFit]);

  const featureCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: visibleAccounts.map((row) => ({
        type: 'Feature' as const,
        properties: {
          id: row.id,
          qualificationStatus: getQualificationStatus(row),
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [row.longitude!, row.latitude!],
        },
      })),
    }),
    [visibleAccounts]
  );

  const handleClusterClick = useCallback((event: MapMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature || feature.geometry.type !== 'Point') return;

    const coords = feature.geometry.coordinates as [number, number];
    const clusterId = feature.properties?.cluster_id;

    const source = mapRef.current?.getSource('accounts') as any;

    source?.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
      if (err) return;

      mapRef.current?.easeTo({
        center: coords,
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
        (a) => a.id === feature.properties?.id
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
    return <div>Missing Mapbox Token</div>;
  }

  return (
    <div className="rounded-xl overflow-hidden border">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: -98, latitude: 39, zoom: 3 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        interactiveLayerIds={['clusters', 'unclustered-point']}
        onIdle={() => void loadVisibleAccounts()}
        onClick={(event) => {
          const feature = event.features?.[0];
          if (!feature) return setPopupAccount(null);

          const layerId = feature.layer?.id;

          if (layerId === 'clusters') return handleClusterClick(event);
          if (layerId === 'unclustered-point')
            return handlePointClick(event);
        }}
      >
        <NavigationControl position="top-right" />

        <Source
          id="accounts"
          type="geojson"
          data={featureCollection}
          cluster
        >
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredLayer} />
        </Source>

        {popupAccount && (
          <Popup
            longitude={popupAccount.longitude!}
            latitude={popupAccount.latitude!}
            onClose={() => setPopupAccount(null)}
          >
            <div>
              <strong>{popupAccount.account_name}</strong>
              <br />
              {popupAccount.city}, {popupAccount.state}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}