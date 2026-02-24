import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { formatZAR, timeAgo } from '@/lib/api';
import type { Listing } from '@/types';
import {
  Heart, Loader2, RefreshCw, ShoppingCart, Trash2, MapPin, Clock,
  Share2, ArrowRight, Package, AlertTriangle, Tag
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface WishlistViewProps {
  onViewDetail: (listing: Listing) => void;
  onViewChange: (view: string) => void;
}

const WishlistView: React.FC<WishlistViewProps> = ({ onViewDetail, onViewChange }) => {
  const { user } = useAuth();
  const { wishlistItems, wishlistLoading, removeFromWishlist, moveToCart, refreshWishlist, isInCart } = useCart();
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());

  const handleRemove = async (listingId: string) => {
    setRemovingIds(prev => new Set(prev).add(listingId));
    await removeFromWishlist(listingId);
    setRemovingIds(prev => { const s = new Set(prev); s.delete(listingId); return s; });
  };

  const handleMoveToCart = async (listingId: string) => {
    setMovingIds(prev => new Set(prev).add(listingId));
    await moveToCart(listingId);
    setMovingIds(prev => { const s = new Set(prev); s.delete(listingId); return s; });
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/?view=wishlist&user=${user?.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My SnapUp Wishlist', url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link Copied', description: 'Wishlist link copied to clipboard' });
      }
    } catch {
      toast({ title: 'Share', description: 'Copy the URL to share your wishlist' });
    }
  };

  // Filter out sold/archived items
  const activeItems = wishlistItems.filter(i => i.listing && i.listing.status === 'active');
  const unavailableItems = wishlistItems.filter(i => i.listing && i.listing.status !== 'active');

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-500" />
            My Wishlist
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {wishlistItems.length} item{wishlistItems.length !== 1 ? 's' : ''} saved for later
          </p>
        </div>
        <div className="flex items-center gap-2">
          {wishlistItems.length > 0 && (
            <button
              onClick={handleShare}
              className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-200"
              title="Share Wishlist"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={refreshWishlist}
            className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-200"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {wishlistLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading wishlist...</p>
          </div>
        </div>
      )}

      {!wishlistLoading && wishlistItems.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Your wishlist is empty</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Save items you love by tapping the heart icon on any listing. Come back later to buy them!
          </p>
          <button
            onClick={() => onViewChange('home')}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all inline-flex items-center gap-2"
          >
            Browse Listings <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active items */}
      {!wishlistLoading && activeItems.length > 0 && (
        <div className="space-y-3">
          {activeItems.map((item) => {
            const listing = item.listing!;
            const isRemoving = removingIds.has(item.listing_id);
            const isMoving = movingIds.has(item.listing_id);
            const alreadyInCart = isInCart(item.listing_id);
            const imageUrl = listing.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=200&fit=crop';

            return (
              <div
                key={item.id}
                className={`bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all ${isRemoving ? 'opacity-50' : ''}`}
              >
                <div className="flex gap-4 p-4">
                  {/* Image */}
                  <div
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 cursor-pointer"
                    onClick={() => onViewDetail(listing)}
                  >
                    <img src={imageUrl} alt={listing.title} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className="font-semibold text-gray-900 line-clamp-1 cursor-pointer hover:text-blue-600 transition-colors"
                      onClick={() => onViewDetail(listing)}
                    >
                      {listing.title}
                    </h3>
                    <p className="text-xl font-black text-blue-600 mt-1">{formatZAR(listing.price)}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{listing.location || listing.province}</span>
                      <span className="flex items-center gap-1"><Package className="w-3 h-3" />{listing.seller_name || 'Seller'}</span>
                      {listing.category_name && (
                        <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{listing.category_name}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">Added {timeAgo(item.added_at)}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleMoveToCart(item.listing_id)}
                      disabled={isMoving || alreadyInCart}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                        alreadyInCart
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                      }`}
                    >
                      {isMoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                      {alreadyInCart ? 'In Cart' : 'Move to Cart'}
                    </button>
                    <button
                      onClick={() => handleRemove(item.listing_id)}
                      disabled={isRemoving}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-all"
                    >
                      {isRemoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unavailable items */}
      {!wishlistLoading && unavailableItems.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            No Longer Available ({unavailableItems.length})
          </h3>
          <div className="space-y-2">
            {unavailableItems.map((item) => {
              const listing = item.listing!;
              return (
                <div key={item.id} className="bg-gray-50 rounded-xl border border-gray-200 p-4 flex items-center gap-4 opacity-60">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                    <img src={listing.images?.[0] || ''} alt={listing.title} className="w-full h-full object-cover grayscale" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-600 line-clamp-1">{listing.title}</h4>
                    <p className="text-sm text-gray-400 line-through">{formatZAR(listing.price)}</p>
                    <span className="text-xs text-red-500 font-medium">{listing.status === 'sold' ? 'Sold' : 'Archived'}</span>
                  </div>
                  <button
                    onClick={() => handleRemove(item.listing_id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default WishlistView;
