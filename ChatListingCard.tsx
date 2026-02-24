import React, { useEffect, useState, useCallback } from 'react';
import { getListing, formatZAR } from '@/lib/api';
import { CONDITION_LABELS } from '@/types';
import type { Listing } from '@/types';
import {
  MapPin, Eye, ExternalLink, ShoppingBag, Package,
  Loader2, AlertTriangle, MessageSquare, ChevronRight, X, Tag
} from 'lucide-react';



interface ChatListingCardProps {
  listingId: string;
  /** Fallback data from conversation (used while full listing loads) */
  fallbackTitle?: string;
  fallbackImage?: string;
  fallbackPrice?: number;
  /** Called when user clicks "View Listing" */
  onViewListing?: (listing: Listing) => void;
  /** Called when user clicks "Make Offer" (only for negotiable listings) */
  onMakeOffer?: (listing: Listing) => void;
  /** Compact mode for mobile */
  compact?: boolean;
  /** Allow dismissing the card */
  dismissible?: boolean;
}

const ChatListingCard: React.FC<ChatListingCardProps> = ({
  listingId,
  fallbackTitle,
  fallbackImage,
  fallbackPrice,
  onViewListing,
  onMakeOffer,
  compact = false,
  dismissible = false,
}) => {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const fetchListing = useCallback(async () => {
    if (!listingId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const data = await getListing(listingId);
      setListing(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  if (dismissed) return null;

  // Use listing data if available, otherwise fallback to conversation data
  const title = listing?.title || fallbackTitle || 'Listing';
  const image = listing?.images?.[0] || fallbackImage;
  const price = listing?.price ?? fallbackPrice;
  const condition = listing?.condition;
  const location = listing?.location;
  const province = listing?.province;
  const status = listing?.status;
  const isNegotiable = listing?.is_negotiable;
  const viewCount = listing?.view_count;
  const categoryName = listing?.category_name;

  const isSold = status === 'sold';
  const isArchived = status === 'archived';
  const canMakeOffer = isNegotiable && listing && onMakeOffer && !isSold && !isArchived && status === 'active';

  const handleClick = () => {
    if (listing && onViewListing) {
      onViewListing(listing);
    }
  };

  const handleMakeOffer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (listing && onMakeOffer) {
      onMakeOffer(listing);
    }
  };

  // ==========================================
  // COMPACT CARD (mobile)
  // ==========================================
  if (compact) {
    return (
      <div className="flex-shrink-0 border-b border-gray-200 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <button
            onClick={handleClick}
            disabled={!listing || !onViewListing}
            className="flex-1 flex items-center gap-3 text-left hover:bg-blue-50/50 transition-colors active:bg-blue-100/50 disabled:cursor-default group min-w-0"
          >
            {/* Listing Image */}
            <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 shadow-sm">
              {image ? (
                <img
                  src={image}
                  alt={title}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <Package className="w-5 h-5 text-gray-300" />
                </div>
              )}
              {isSold && (
                <div className="absolute inset-0 bg-red-600/70 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white uppercase tracking-wider">Sold</span>
                </div>
              )}
              {loading && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                </div>
              )}
            </div>

            {/* Listing Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <ShoppingBag className="w-3 h-3 text-blue-500 flex-shrink-0" />
                <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{title}</p>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {price != null && (
                  <span className="text-sm font-black text-blue-600">{formatZAR(price)}</span>
                )}
                {isNegotiable && (
                  <span className="text-[9px] font-medium text-amber-600 bg-amber-50 px-1 py-0.5 rounded">Neg.</span>
                )}
                {condition && (
                  <span className="text-[10px] text-gray-400">{CONDITION_LABELS[condition] || condition}</span>
                )}
              </div>
              {(location || province) && (
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
                  <span className="text-[10px] text-gray-400 truncate">
                    {location}{location && province ? ', ' : ''}{province}
                  </span>
                </div>
              )}
            </div>
          </button>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {canMakeOffer && (
              <button
                onClick={handleMakeOffer}
                className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors active:scale-95"
              >
                <Tag className="w-3 h-3" />
                Offer
              </button>
            )}
            {onViewListing && listing && (
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
            )}
          </div>

          {/* Dismiss button */}
          {dismissible && (
            <button
              onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
              className="p-1 text-gray-300 hover:text-gray-500 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // FULL CARD (desktop)
  // ==========================================
  return (
    <div className="flex-shrink-0 border-b border-gray-200">
      <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-blue-50/90 px-4 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={handleClick}
            disabled={!listing || !onViewListing}
            className="flex-1 flex items-center gap-4 text-left group disabled:cursor-default min-w-0"
          >
            {/* Listing Image */}
            <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 shadow-md ring-1 ring-black/5">
              {image ? (
                <img
                  src={image}
                  alt={title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <Package className="w-6 h-6 text-gray-300" />
                </div>
              )}
              {isSold && (
                <div className="absolute inset-0 bg-red-600/75 flex items-center justify-center backdrop-blur-[1px]">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">Sold</span>
                </div>
              )}
              {isArchived && (
                <div className="absolute inset-0 bg-gray-600/75 flex items-center justify-center backdrop-blur-[1px]">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">Archived</span>
                </div>
              )}
              {loading && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                </div>
              )}
            </div>

            {/* Listing Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="flex items-center gap-1">
                  <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Linked Listing</span>
                </div>
                {categoryName && (
                  <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100">
                    {categoryName}
                  </span>
                )}
              </div>

              <p className="text-sm font-bold text-gray-900 truncate leading-tight group-hover:text-blue-700 transition-colors">
                {title}
              </p>

              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {price != null && (
                  <span className="text-base font-black text-blue-600">{formatZAR(price)}</span>
                )}
                {isNegotiable && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100">
                    Negotiable
                  </span>
                )}
                {condition && (
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">
                    {CONDITION_LABELS[condition] || condition}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1">
                {(location || province) && (
                  <span className="flex items-center gap-1 text-[11px] text-gray-400">
                    <MapPin className="w-3 h-3" />
                    {location}{location && province ? ', ' : ''}{province}
                  </span>
                )}
                {viewCount != null && viewCount > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-gray-400">
                    <Eye className="w-3 h-3" />
                    {viewCount} views
                  </span>
                )}
              </div>
            </div>
          </button>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Make Offer Button */}
            {canMakeOffer && (
              <button
                onClick={handleMakeOffer}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl shadow-sm hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-emerald-100 transition-all active:scale-95"
              >
                <Tag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Make Offer</span>
                <span className="sm:hidden">Offer</span>
              </button>
            )}

            {/* View Listing Button */}
            {onViewListing && listing && (
              <button
                onClick={(e) => { e.stopPropagation(); handleClick(); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 bg-white border border-blue-200 rounded-xl shadow-sm hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:shadow-blue-200 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">View Listing</span>
              </button>
            )}
          </div>

          {/* Dismiss button */}
          {dismissible && (
            <button
              onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
              className="p-1.5 text-gray-300 hover:text-gray-500 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Error state */}
        {error && !listing && (
          <div className="flex items-center gap-2 mt-2 px-1">
            <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
            <span className="text-[10px] text-amber-600">Could not load full listing details</span>
            <button
              onClick={(e) => { e.stopPropagation(); fetchListing(); }}
              className="text-[10px] text-blue-600 hover:text-blue-700 font-medium underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// GENERAL CHAT HEADER (no listing linked)
// ==========================================
export const GeneralChatHeader: React.FC = () => (
  <div className="flex-shrink-0 border-b border-gray-200">
    <div className="bg-gradient-to-r from-gray-50 to-gray-100/50 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-gray-400" />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">General Chat</p>
          <p className="text-[11px] text-gray-400">This conversation is not linked to a specific listing</p>
        </div>
      </div>
    </div>
  </div>
);

export default ChatListingCard;
