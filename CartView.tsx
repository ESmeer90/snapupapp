import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { formatZAR, timeAgo } from '@/lib/api';
import { calculateTotal } from '@/lib/payfast';
import type { Listing } from '@/types';
import {
  ShoppingCart, Loader2, RefreshCw, Trash2, MapPin, Plus, Minus,
  ArrowRight, Package, Shield, CreditCard, Heart, AlertTriangle,
  Tag, Truck, Info, CheckCircle2, X
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface CartViewProps {
  onViewDetail: (listing: Listing) => void;
  onViewChange: (view: string) => void;
  onCheckoutCart: () => void;
}

const CartView: React.FC<CartViewProps> = ({ onViewDetail, onViewChange, onCheckoutCart }) => {
  const { user } = useAuth();
  const {
    cartItems, cartLoading, cartCount, cartTotal,
    removeFromCart, updateCartQuantity, clearCart, moveToWishlist, refreshCart
  } = useCart();
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // Check for sold/unavailable items
  const activeItems = cartItems.filter(i => i.listing && i.listing.status === 'active');
  const unavailableItems = cartItems.filter(i => i.listing && i.listing.status !== 'active');

  // Remove unavailable items automatically
  useEffect(() => {
    if (unavailableItems.length > 0) {
      toast({
        title: 'Items Unavailable',
        description: `${unavailableItems.length} item(s) in your cart are no longer available and will be removed.`,
        variant: 'destructive',
      });
      unavailableItems.forEach(item => removeFromCart(item.listing_id));
    }
  }, [unavailableItems.length]);

  const handleRemove = async (listingId: string) => {
    setRemovingIds(prev => new Set(prev).add(listingId));
    await removeFromCart(listingId);
    setRemovingIds(prev => { const s = new Set(prev); s.delete(listingId); return s; });
  };

  const handleSaveForLater = async (listingId: string) => {
    setSavingIds(prev => new Set(prev).add(listingId));
    await moveToWishlist(listingId);
    setSavingIds(prev => { const s = new Set(prev); s.delete(listingId); return s; });
  };

  // Calculate totals
  const subtotal = activeItems.reduce((sum, item) => {
    const price = typeof item.listing?.price === 'number' ? item.listing.price : 0;
    return sum + price * item.quantity;
  }, 0);
  const { serviceFee: totalServiceFee } = calculateTotal(subtotal);
  const estimatedTotal = subtotal + totalServiceFee;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-blue-600" />
            Shopping Cart
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {cartCount} item{cartCount !== 1 ? 's' : ''} in your cart
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeItems.length > 0 && (
            <button
              onClick={() => { if (confirm('Clear all items from your cart?')) clearCart(); }}
              className="px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-all border border-red-200"
            >
              Clear Cart
            </button>
          )}
          <button
            onClick={refreshCart}
            className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-200"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {cartLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading cart...</p>
          </div>
        </div>
      )}

      {!cartLoading && cartItems.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Your cart is empty</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Add items to your cart from listings to start shopping. You can also move items from your wishlist.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => onViewChange('home')}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all inline-flex items-center gap-2"
            >
              Browse Listings <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewChange('wishlist')}
              className="px-6 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all inline-flex items-center gap-2"
            >
              <Heart className="w-4 h-4" /> View Wishlist
            </button>
          </div>
        </div>
      )}

      {!cartLoading && activeItems.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-3">
            {activeItems.map((item) => {
              const listing = item.listing!;
              const isRemoving = removingIds.has(item.listing_id);
              const isSaving = savingIds.has(item.listing_id);
              const imageUrl = listing.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=200&fit=crop';
              const itemTotal = listing.price * item.quantity;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all ${isRemoving ? 'opacity-50 scale-95' : ''}`}
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
                      <div className="flex items-start justify-between gap-2">
                        <h3
                          className="font-semibold text-gray-900 line-clamp-1 cursor-pointer hover:text-blue-600 transition-colors"
                          onClick={() => onViewDetail(listing)}
                        >
                          {listing.title}
                        </h3>
                        <button
                          onClick={() => handleRemove(item.listing_id)}
                          disabled={isRemoving}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <p className="text-lg font-black text-blue-600 mt-0.5">{formatZAR(listing.price)}</p>

                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1"><Package className="w-3 h-3" />{listing.seller_name || 'Seller'}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{listing.province}</span>
                      </div>

                      {/* Quantity + Actions */}
                      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => item.quantity > 1 ? updateCartQuantity(item.listing_id, item.quantity - 1) : handleRemove(item.listing_id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-all"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-10 text-center font-semibold text-sm">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQuantity(item.listing_id, item.quantity + 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveForLater(item.listing_id)}
                            disabled={isSaving}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Heart className="w-3 h-3" />}
                            Save for Later
                          </button>
                          <span className="text-sm font-bold text-gray-900">{formatZAR(itemTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-24">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Order Summary</h3>

              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal ({activeItems.length} item{activeItems.length !== 1 ? 's' : ''})</span>
                  <span className="font-medium text-gray-900">{formatZAR(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1">
                    Service fee (2.5%)
                    <span className="group relative">
                      <Info className="w-3 h-3 text-gray-400 cursor-help" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                        Covers payment processing, buyer protection, and platform maintenance.
                      </span>
                    </span>
                  </span>
                  <span className="font-medium text-gray-900">{formatZAR(totalServiceFee)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Truck className="w-3 h-3" /> Shipping
                  </span>
                  <span className="text-xs text-gray-400 italic">Calculated at checkout</span>
                </div>
                <div className="border-t border-gray-200 pt-3 mt-3 flex justify-between">
                  <span className="font-bold text-gray-900">Estimated Total</span>
                  <span className="font-black text-blue-600 text-xl">{formatZAR(estimatedTotal)}</span>
                </div>
              </div>

              {/* Free shipping hint */}
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 flex-shrink-0" />
                  Shipping calculated per seller at checkout
                </p>
              </div>

              {/* Checkout Button */}
              <button
                onClick={onCheckoutCart}
                className="w-full mt-4 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-3 text-base group"
              >
                <CreditCard className="w-5 h-5 group-hover:scale-110 transition-transform" />
                Checkout — {formatZAR(estimatedTotal)}
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-[11px] text-gray-400 text-center mt-3 flex items-center justify-center gap-1">
                <Shield className="w-3 h-3 text-blue-400" />
                Secure payment via PayFast
              </p>

              {/* Continue Shopping */}
              <button
                onClick={() => onViewChange('home')}
                className="w-full mt-3 py-2.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default CartView;
