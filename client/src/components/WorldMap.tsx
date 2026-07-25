import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Article {
  title: string;
  url: string;
  source_id: string;
  source_name: string;
  published_at: string;
  bias: string;
}

interface CountryData {
  country: string;
  lat: number;
  lng: number;
  iso: string;
  articleCount: number;
  latestArticle: Article | null;
}

interface CountryArticle {
  title: string;
  url: string;
  excerpt: string;
  published_at: string;
  source_name: string;
  bias: string;
  credibility_score: number;
}

const BIAS_COLORS: Record<string, string> = {
  left: '#3b82f6',
  'lean-left': '#60a5fa',
  center: '#a3a3a3',
  'lean-right': '#f97316',
  right: '#ef4444',
};

function createMarkerIcon(count: number, bias: string): L.DivIcon {
  const color = BIAS_COLORS[bias] || '#a3a3a3';
  const size = Math.min(20 + count * 2, 48);
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};opacity:0.85;
      display:flex;align-items:center;justify-content:center;
      color:white;font-weight:700;font-size:${size > 30 ? 13 : 11}px;
      border:2px solid rgba(255,255,255,0.4);
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      cursor:pointer;transition:transform 0.15s;
    " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function CursorZoomHandler() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const zoom = map.getZoom() + delta;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const latLng = map.containerPointToLatLng(L.point(x, y));
      map.setView(latLng, Math.max(2, Math.min(18, zoom)));
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, [map]);
  return null;
}

interface WorldMapProps {
  onSelectCountry: (country: string) => void;
}

export default function WorldMap({ onSelectCountry }: WorldMapProps) {
  const [countries, setCountries] = useState<CountryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/world-map/articles')
      .then(r => r.json())
      .then(data => {
        setCountries(data.countries || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="w-full h-[500px] bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400 text-sm">Loading world map...</div>
      </div>
    );
  }

  const maxCount = Math.max(...countries.map(c => c.articleCount), 1);

  return (
    <div className="w-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 relative"
         style={{ height: '520px', zIndex: 0 }}>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        minZoom={2}
        maxZoom={18}
        style={{ height: '100%', width: '100%', background: '#1a1a2e' }}
        zoomControl={false}
        worldCopyJump={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        <CursorZoomHandler />
        {countries.map(c => (
          <Marker
            key={c.country}
            position={[c.lat, c.lng]}
            icon={createMarkerIcon(c.articleCount, c.latestArticle?.bias || 'center')}
            eventHandlers={{
              click: () => onSelectCountry(c.country),
            }}
          >
            <Popup>
              <div className="min-w-[200px]">
                <div className="font-bold text-sm mb-1">{c.country}</div>
                <div className="text-xs text-gray-500 mb-2">{c.articleCount} articles</div>
                {c.latestArticle && (
                  <div>
                    <a
                      href={c.latestArticle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-600 hover:underline block mb-1 leading-tight"
                    >
                      {c.latestArticle.title}
                    </a>
                    <div className="text-[10px] text-gray-400">
                      {c.latestArticle.source_name} · {new Date(c.latestArticle.published_at).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
