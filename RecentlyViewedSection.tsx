import React, { useState, useEffect, useCallback } from 'react';
import { getCachedListings, type CachedListing } from '@/lib/offline-db';
import { formatZAR } from '@/lib/api';
import type { Listing } from '@/types';
import {
  Clock, WifiOff, MapPin, Eye, Trash2, RefreshCw, Loader2, Package
} from 'lucide-react';

interface RecentlyViewedSectionProps {
  onViewDetail?: (listing: Listing) => void;
  compact?: boolean;
}

const RecentlyViewedSection: React.FC<RecentlyViewedSectionProps> = ({ onViewDetail, compact = false }) => {
  const [listings, setListings] = useState<CachedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const loadCachedListings = useCallback(async () => {
    setLoading(true);
    try {
      const cached = await getCachedListings();
      setListings(cached);
    } catch (err) {
      console.warn('[RecentlyViewed] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCachedListings();

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadCachedListings]);

  const handleViewDetail = (cached: CachedListing) => {
    if (!onViewDetail) return;
    // Convert CachedListing to Listing format
    const listing: Listing = {
      id: cached.id,
      title: cached.title,
      description: cached.description || '',
      price: cached.price,
      images: cached.images || [],
      location: cached.location || '',
      province: cached.province || '',
      category_name: cached.category_name || '',
      condition: cached.condition || 'good',
      seller_name: cached.seller_name || 'Seller',
      user_id: cached.user_id || '',
      status: 'active',
      created_at: cached.viewed_at,
      updated_at: cached.viewed_at,
      view_count: 0,
      is_negotiable: false,
      category_id: '',
    } as Listing;
    onViewDetail(listing);
  };

  const clearCache = async () => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('snapup-offline', 2);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('listings', 'readwrite');
      tx.objectStore('listings').clear();
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
      setListings([]);
    } catch (err) {
      console.warn('[RecentlyViewed] Clear failed:', err);
    }
  };

  const timeAgoShort = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin mx-auto" />
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Clock className="w-8 h-8 text-gray-300" />
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">No recently viewed listings</p>
        <p className="text-xs text-gray-400">Listings you view will be cached here for offline access</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900">Recently Viewed</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
            {listings.length}
          </span>
          {isOffline && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded-full">
              <WifiOff className="w-3 h-3" />
              Offline
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadCachedListings}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {listings.length > 0 && (
            <button
              onClick={clearCache}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              title="Clear recently viewed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className={`grid gap-3 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
        {listings.map((listing) => (
          <button
            key={listing.id}
            onClick={() => handleViewDetail(listing)}
            className="group bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-left"
          >
            {/* Image */}
            <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
              {listing.images && listing.images[0] ? (
                <img
                  src={listing.images[0]}
                  alt={listing.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/placeholder.svg';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-8 h-8 text-gray-300" />
                </div>
              )}

              {/* Cached badge */}
              <div className="absolute top-2 left-2">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-black/60 text-white rounded-md backdrop-blur-sm">
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  Cached
                </span>
              </div>

              {/* Viewed time */}
              <div className="absolute bottom-2 right-2">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium bg-black/50 text-white rounded-md backdrop-blur-sm">
                  <Eye className="w-2.5 h-2.5" />
                  {timeAgoShort(listing.viewed_at)}
                </span>
              </div>
            </div>

            {/* Info */}
            <div className="p-2.5">
              <p className="text-xs font-semibold text-gray-900 line-clamp-1 group-hover:text-blue-700 transition-colors">
                {listing.title}
              </p>
              <p className="text-sm font-bold text-blue-600 mt-0.5">
                {formatZAR(listing.price)}
              </p>
              {listing.location && (
                <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-0.5 truncate">
                  <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                  {listing.location}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RecentlyViewedSection;
