import React, { useState, useMemo, useEffect } from 'react';
import type { Listing, SAProvince } from '@/types';
import { SA_PROVINCE_COORDS, SA_CENTER, SA_PROVINCES } from '@/types';
import { formatZAR } from '@/lib/api';
import {
  MapPin, X, ZoomIn, ZoomOut, Crosshair, List, Map as MapIcon,
  Navigation, Package, ChevronLeft, ChevronRight
} from 'lucide-react';

interface MapViewProps {
  listings: Listing[];
  onViewDetail: (listing: Listing) => void;
  onProvinceChange: (province: string) => void;
  selectedProvince: string;
}

// Province boundaries (approximate bounding boxes for SA provinces)
const PROVINCE_PATHS: Record<string, { cx: number; cy: number; r: number }> = {
  'Gauteng': { cx: 460, cy: 290, r: 25 },
  'Western Cape': { cx: 280, cy: 500, r: 55 },
  'KwaZulu-Natal': { cx: 530, cy: 380, r: 45 },
  'Eastern Cape': { cx: 420, cy: 460, r: 55 },
  'Free State': { cx: 420, cy: 350, r: 50 },
  'Limpopo': { cx: 480, cy: 200, r: 50 },
  'Mpumalanga': { cx: 530, cy: 270, r: 35 },
  'North West': { cx: 400, cy: 270, r: 45 },
  'Northern Cape': { cx: 280, cy: 340, r: 80 },
};

// Map lat/lng to SVG coordinates (simplified projection)
function latLngToSvg(lat: number, lng: number): { x: number; y: number } {
  // SA bounds: lat -22 to -35, lng 16 to 33
  const x = ((lng - 16) / (33 - 16)) * 600 + 50;
  const y = ((lat - (-22)) / (-35 - (-22))) * 500 + 50;
  return { x, y };
}

const MapView: React.FC<MapViewProps> = ({ listings, onViewDetail, onProvinceChange, selectedProvince }) => {
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null);
  const [selectedPin, setSelectedPin] = useState<Listing | null>(null);
  const [zoom, setZoom] = useState(1);
  const [userProvince, setUserProvince] = useState<string>('');

  // Group listings by province
  const listingsByProvince = useMemo(() => {
    const map: Record<string, Listing[]> = {};
    for (const listing of listings) {
      const p = listing.province;
      if (!map[p]) map[p] = [];
      map[p].push(listing);
    }
    return map;
  }, [listings]);

  // Province pin positions
  const provincePins = useMemo(() => {
    return SA_PROVINCES.map(province => {
      const coords = SA_PROVINCE_COORDS[province];
      const svgPos = latLngToSvg(coords.lat, coords.lng);
      const count = listingsByProvince[province]?.length || 0;
      return { province, ...svgPos, count };
    });
  }, [listingsByProvince]);

  // Auto-detect province from geolocation
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          // Find nearest province
          let nearest = '';
          let minDist = Infinity;
          for (const [prov, coords] of Object.entries(SA_PROVINCE_COORDS)) {
            const dist = Math.sqrt(
              Math.pow(latitude - coords.lat, 2) + Math.pow(longitude - coords.lng, 2)
            );
            if (dist < minDist) {
              minDist = dist;
              nearest = prov;
            }
          }
          setUserProvince(nearest);
        },
        () => { /* Geolocation denied or unavailable */ },
        { timeout: 5000 }
      );
    }
  }, []);

  const handleProvinceClick = (province: string) => {
    if (selectedProvince === province) {
      onProvinceChange('');
    } else {
      onProvinceChange(province);
    }
    setSelectedPin(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Map Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Listings Map</h3>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {listings.length} listings
          </span>
        </div>
        <div className="flex items-center gap-1">
          {userProvince && (
            <button
              onClick={() => onProvinceChange(userProvince)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
              title={`Near you: ${userProvince}`}
            >
              <Crosshair className="w-3 h-3" />
              Near Me
            </button>
          )}
          <button
            onClick={() => setZoom(z => Math.min(z + 0.25, 2))}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(z - 0.25, 0.75))}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SVG Map */}
      <div className="relative" style={{ height: '400px', overflow: 'hidden' }}>
        <svg
          viewBox="0 0 700 600"
          className="w-full h-full"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.3s' }}
        >
          {/* Background */}
          <rect x="0" y="0" width="700" height="600" fill="#f0f9ff" />

          {/* SA outline (simplified) */}
          <path
            d="M 280 120 L 540 120 L 580 180 L 600 250 L 580 350 L 560 420 L 520 470 L 450 520 L 380 540 L 300 530 L 240 500 L 200 450 L 180 380 L 160 300 L 180 220 L 220 160 Z"
            fill="#e0f2fe"
            stroke="#93c5fd"
            strokeWidth="2"
          />

          {/* Province regions */}
          {Object.entries(PROVINCE_PATHS).map(([province, { cx, cy, r }]) => {
            const isSelected = selectedProvince === province;
            const isHovered = hoveredProvince === province;
            const count = listingsByProvince[province]?.length || 0;
            const isUserProvince = userProvince === province;

            return (
              <g key={province}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={isSelected ? '#3b82f6' : isHovered ? '#93c5fd' : isUserProvince ? '#bfdbfe' : '#dbeafe'}
                  fillOpacity={isSelected ? 0.3 : isHovered ? 0.4 : 0.2}
                  stroke={isSelected ? '#2563eb' : isHovered ? '#3b82f6' : 'transparent'}
                  strokeWidth={isSelected ? 2 : 1}
                  strokeDasharray={isUserProvince && !isSelected ? '4 2' : 'none'}
                  className="cursor-pointer transition-all duration-200"
                  onMouseEnter={() => setHoveredProvince(province)}
                  onMouseLeave={() => setHoveredProvince(null)}
                  onClick={() => handleProvinceClick(province)}
                />
                {/* Province label */}
                <text
                  x={cx}
                  y={cy - r - 5}
                  textAnchor="middle"
                  className="text-[9px] font-medium fill-gray-500 pointer-events-none select-none"
                >
                  {province}
                </text>
              </g>
            );
          })}

          {/* Listing pins */}
          {provincePins.filter(p => p.count > 0).map(({ province, x, y, count }) => {
            const isSelected = selectedProvince === province;
            const pinSize = Math.min(Math.max(count * 2 + 8, 12), 30);

            return (
              <g
                key={`pin-${province}`}
                className="cursor-pointer"
                onClick={() => handleProvinceClick(province)}
              >
                {/* Pin circle */}
                <circle
                  cx={x}
                  cy={y}
                  r={pinSize / 2}
                  fill={isSelected ? '#dc2626' : '#3b82f6'}
                  stroke="white"
                  strokeWidth="2"
                  className="transition-all duration-200"
                />
                {/* Count label */}
                <text
                  x={x}
                  y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[9px] font-bold fill-white pointer-events-none select-none"
                >
                  {count}
                </text>
                {/* Pulse animation for selected */}
                {isSelected && (
                  <circle
                    cx={x}
                    cy={y}
                    r={pinSize / 2 + 4}
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth="1.5"
                    opacity="0.5"
                  >
                    <animate attributeName="r" from={pinSize / 2 + 2} to={pinSize / 2 + 12} dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}

          {/* User location indicator */}
          {userProvince && (
            <g>
              {(() => {
                const coords = SA_PROVINCE_COORDS[userProvince as SAProvince];
                if (!coords) return null;
                const pos = latLngToSvg(coords.lat, coords.lng);
                return (
                  <>
                    <circle cx={pos.x} cy={pos.y + 20} r="5" fill="#10b981" stroke="white" strokeWidth="2" />
                    <circle cx={pos.x} cy={pos.y + 20} r="10" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.5">
                      <animate attributeName="r" from="5" to="15" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
                    </circle>
                  </>
                );
              })()}
            </g>
          )}
        </svg>

        {/* Hover tooltip */}
        {hoveredProvince && (
          <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 px-3 py-2 pointer-events-none z-10">
            <p className="text-sm font-semibold text-gray-900">{hoveredProvince}</p>
            <p className="text-xs text-gray-500">
              {listingsByProvince[hoveredProvince]?.length || 0} listing(s)
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 px-3 py-2 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-gray-600">Listings cluster</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-600">Selected province</span>
          </div>
          {userProvince && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-gray-600">Your location</span>
            </div>
          )}
        </div>
      </div>

      {/* Province Listings Preview */}
      {selectedProvince && listingsByProvince[selectedProvince] && (
        <div className="border-t border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-500" />
              {selectedProvince}
              <span className="text-xs text-gray-500 font-normal">
                ({listingsByProvince[selectedProvince].length} listings)
              </span>
            </h4>
            <button
              onClick={() => onProvinceChange('')}
              className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {listingsByProvince[selectedProvince].slice(0, 6).map(listing => (
              <button
                key={listing.id}
                onClick={() => onViewDetail(listing)}
                className="flex-shrink-0 w-36 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all text-left"
              >
                <div className="aspect-[4/3] bg-gray-200">
                  {listing.images?.[0] && (
                    <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium text-gray-900 truncate">{listing.title}</p>
                  <p className="text-xs font-bold text-blue-600">{formatZAR(listing.price)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;
