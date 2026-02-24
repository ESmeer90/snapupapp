import React, { useState } from 'react';
import type { Listing } from '@/types';
import { formatZAR, timeAgo } from '@/lib/api';
import { Heart, MapPin, Clock, Eye, Tag } from 'lucide-react';

interface ListingCardProps {
  listing: Listing;
  isFavorited: boolean;
  onToggleFavorite: (listingId: string) => void;
  onViewDetail: (listing: Listing) => void;
  isLoggedIn: boolean;
}

const PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&h=300&fit=crop',
];

const ListingCard: React.FC<ListingCardProps> = ({ listing, isFavorited, onToggleFavorite, onViewDetail, isLoggedIn }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const imageUrl = listing.images && listing.images.length > 0 && !imageError
    ? listing.images[0]
    : PLACEHOLDER_IMAGES[Math.abs(listing.title.charCodeAt(0)) % PLACEHOLDER_IMAGES.length];

  return (
    <div
      className="group bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-gray-300 transition-all duration-300 cursor-pointer"
      onClick={() => onViewDetail(listing)}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gray-200 animate-pulse" />
        )}
        <img
          src={imageUrl}
          alt={listing.title}
          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setImageError(true);
            setImageLoaded(true);
          }}
        />

        {/* Favorite Button */}
        {isLoggedIn && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(listing.id); }}
            className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-md ${
              isFavorited
                ? 'bg-red-500 text-white'
                : 'bg-white/90 backdrop-blur-sm text-gray-600 hover:bg-white hover:text-red-500'
            }`}
          >
            <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
          </button>
        )}

        {/* Status Badge */}
        {listing.is_negotiable && (
          <div className="absolute top-3 left-3 px-2.5 py-1 bg-amber-500 text-white text-xs font-bold rounded-full shadow-md">
            Negotiable
          </div>
        )}

        {/* Condition Badge */}
        {listing.condition === 'new' && (
          <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-blue-500 text-white text-xs font-bold rounded-full shadow-md">
            Brand New
          </div>
        )}

        {/* Image count badge */}
        {listing.images && listing.images.length > 1 && (
          <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 text-white text-xs font-medium rounded-full backdrop-blur-sm">
            {listing.images.length} photos
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
            {listing.title}
          </h3>
        </div>

        <p className="text-xl font-black text-blue-600 mt-1">
          {formatZAR(listing.price)}
        </p>

        <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {listing.location || listing.province}
          </span>
          <span className="flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" />
            {timeAgo(listing.created_at)}
          </span>
        </div>

        {listing.category_name && (
          <div className="mt-3 flex items-center gap-1">
            <Tag className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-400 font-medium">{listing.category_name}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ListingCard;
