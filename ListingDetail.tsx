import React, { useState, useEffect } from 'react';
import type { Listing } from '@/types';
import { CONDITION_LABELS, BUYER_PROTECTION_LIMIT } from '@/types';
import { formatZAR, timeAgo, sendMessage, createOffer, getPendingOffersCount } from '@/lib/api';
import { calculateTotal } from '@/lib/payfast';
import { calculateCommission } from '@/lib/commission';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import TrustBadge from './TrustBadge';
import TrustScoreWidget from './TrustScoreWidget';
import PriceAlertModal from './PriceAlertModal';
import MakeOfferModal from './MakeOfferModal';
import ShareButton from './ShareButton';
import {
  Heart, MapPin, Clock, Eye, Tag, ChevronLeft, ChevronRight,
  MessageSquare, Share2, Shield, User, Send, Loader2, Phone, X,
  CreditCard, Wallet, ShoppingBag, ShoppingCart, Info, ExternalLink, CheckCircle2,
  Bell, BellRing, Bookmark
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';




const PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&h=600&fit=crop',
];

interface ListingDetailProps {
  listing: Listing | null;
  onClose: () => void;
  isFavorited: boolean;
  onToggleFavorite: (listingId: string) => void;
  onBuyNow?: (listing: Listing) => void;
  onStartChat?: (listing: Listing) => void;
  onViewSellerProfile?: (userId: string) => void;
}

const ListingDetail: React.FC<ListingDetailProps> = ({ listing, onClose, isFavorited, onToggleFavorite, onBuyNow, onStartChat, onViewSellerProfile }) => {
  const { user } = useAuth();
  let cart: any = null;
  try { cart = useCart(); } catch { /* CartProvider not available */ }
  const [currentImage, setCurrentImage] = useState(0);

  const [message, setMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [priceAlertOpen, setPriceAlertOpen] = useState(false);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [hasPendingOffer, setHasPendingOffer] = useState(false);

  // Check for pending offers when listing changes
  useEffect(() => {
    if (!listing || !user || user.id === listing.user_id || !listing.is_negotiable) return;
    getPendingOffersCount(listing.id, user.id).then(count => setHasPendingOffer(count > 0)).catch(() => {});
  }, [listing?.id, user?.id]);

  if (!listing) return null;


  const images = listing.images && listing.images.length > 0 ? listing.images : PLACEHOLDER_IMAGES;
  const { serviceFee, total } = calculateTotal(listing.price);
  const commission = calculateCommission(listing.price);
  const isOwnListing = user && user.id === listing.user_id;
  const isEligibleForProtection = listing.price <= BUYER_PROTECTION_LIMIT;

  const sellerInitials = listing.seller_name
    ? listing.seller_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'S';

  const handleSendMessage = async () => {
    if (!user || !message.trim()) return;
    setSendingMessage(true);
    try {
      await sendMessage(listing.id, user.id, listing.user_id, message.trim());
      toast({ title: 'Message sent!', description: 'The seller will be notified.' });
      setMessage('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to send message', variant: 'destructive' });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: 'Link copied!', description: 'Listing link has been copied to clipboard.' });
    } catch {
      toast({ title: 'Share', description: 'Copy the URL from your browser to share this listing.' });
    }
  };

  const handleBuyNow = () => {
    if (onBuyNow) onBuyNow(listing);
  };

  const handleOpenChat = () => {
    if (onStartChat) onStartChat(listing);
  };

  const handleViewProfile = () => {
    if (onViewSellerProfile) onViewSellerProfile(listing.user_id);
  };

  return (
    <div>
      <div className="grid md:grid-cols-2">
        {/* Image Gallery */}
        <div className="relative aspect-square md:aspect-auto md:min-h-[400px] bg-gray-100 rounded-t-2xl md:rounded-l-2xl md:rounded-tr-none overflow-hidden">
          <img src={images[currentImage]} alt={listing.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGES[0]; }} />
          <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all">
            <X className="w-5 h-5 text-gray-700" />
          </button>
          {listing.status === 'sold' && (
            <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-red-600 text-white text-sm font-bold rounded-lg shadow-lg">SOLD</div>
          )}
          {images.length > 1 && (
            <>
              <button onClick={() => setCurrentImage((prev) => (prev - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setCurrentImage((prev) => (prev + 1) % images.length)} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white">
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((_, i) => (
                  <button key={i} onClick={() => setCurrentImage(i)} className={`w-2 h-2 rounded-full transition-all ${i === currentImage ? 'bg-white w-6' : 'bg-white/50'}`} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Details */}
        <div className="p-6 flex flex-col">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {listing.category_name && <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">{listing.category_name}</span>}
              <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">{CONDITION_LABELS[listing.condition] || listing.condition}</span>
              {listing.is_negotiable && <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Negotiable</span>}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{listing.title}</h1>
            <p className="text-3xl font-black text-blue-600 mt-2">{formatZAR(listing.price)}</p>
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{listing.location}</span>
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{timeAgo(listing.created_at)}</span>
              <span className="flex items-center gap-1"><Eye className="w-4 h-4" />{listing.view_count} views</span>
            </div>

            {/* Buyer Protection Trust Badge */}
            <div className="mt-4">
              <TrustBadge
                variant="compact"
                price={listing.price}
                showLink={true}
              />
            </div>

            <div className="mt-6">
              <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{listing.description || 'No description provided.'}</p>
            </div>

            {/* Payment Summary for buyers */}
            {user && !isOwnListing && listing.status === 'active' && (
              <div className="mt-6 bg-blue-50 rounded-xl p-4 border border-blue-100">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm"><Wallet className="w-4 h-4 text-blue-600" />Payment Summary</h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Item price</span><span className="font-medium">{formatZAR(listing.price)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Service fee (2.5%)</span><span className="font-medium">{formatZAR(serviceFee)}</span></div>
                  <div className="border-t border-blue-200 pt-1.5 mt-1.5 flex justify-between"><span className="font-bold text-gray-900 text-sm">Total via PayFast</span><span className="font-black text-blue-600">{formatZAR(total)}</span></div>
                </div>
              </div>
            )}

            {/* Seller Net Estimate (for own listings) */}
            {isOwnListing && (
              <div className="mt-6 bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                  <Wallet className="w-4 h-4 text-emerald-600" />
                  Seller Earnings Estimate
                </h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Sale price</span>
                    <span className="font-medium">{formatZAR(listing.price)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Commission ({Math.round(commission.commissionRate * 100)}%)</span>
                    <span className="font-medium text-red-600">-{formatZAR(commission.commissionAmount)}</span>
                  </div>
                  <div className="border-t border-emerald-200 pt-1.5 mt-1.5 flex justify-between">
                    <span className="font-bold text-gray-900 text-sm">Your net payout</span>
                    <span className="font-black text-emerald-600">{formatZAR(commission.netSellerAmount)}</span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">
                  Commission tier: {commission.tierLabel}
                </p>
              </div>
            )}

            {/* Seller Card with Avatar and Trust Score */}
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center flex-shrink-0">
                  {listing.seller_avatar ? (
                    <img
                      src={listing.seller_avatar}
                      alt={listing.seller_name || 'Seller'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-sm font-bold text-blue-600">${sellerInitials}</span>`;
                      }}
                    />
                  ) : (
                    <span className="text-sm font-bold text-blue-600">{sellerInitials}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">
                      {listing.seller_name || 'Seller'}
                    </p>
                    <TrustScoreWidget sellerId={listing.user_id} variant="badge" />
                  </div>
                  <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{listing.province}</p>
                </div>
                {onViewSellerProfile && (
                  <button
                    onClick={handleViewProfile}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-all"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View Profile
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 text-xs text-gray-400">
              <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" />
              <span>
                Payments processed securely via PayFast. Seller contact information is protected under POPIA.{' '}
                <a href="/buyer-protection" className="text-blue-500 hover:underline">Buyer Protection applies</a>.
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 space-y-3">
            {/* Buy Now + Add to Cart row */}
            {user && !isOwnListing && listing.status === 'active' && (
              <div className="flex gap-2">
                {onBuyNow && (
                  <button onClick={handleBuyNow} className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 text-sm group">
                    <CreditCard className="w-5 h-5 group-hover:scale-110 transition-transform" />Buy Now — {formatZAR(total)}
                  </button>
                )}
                {cart && (
                  <button
                    onClick={() => cart.isInCart(listing.id) ? null : cart.addToCart(listing.id)}
                    className={`px-5 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm ${
                      cart.isInCart(listing.id)
                        ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200'
                        : 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-200'
                    }`}
                  >
                    {cart.isInCart(listing.id) ? (
                      <><CheckCircle2 className="w-5 h-5" /><span className="hidden sm:inline">In Cart</span></>
                    ) : (
                      <><ShoppingCart className="w-5 h-5" /><span className="hidden sm:inline">Add to Cart</span></>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Make Offer button for negotiable listings */}
            {user && !isOwnListing && listing.status === 'active' && listing.is_negotiable && (
              <button
                onClick={() => setOfferModalOpen(true)}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2.5 text-sm group"
              >
                <Tag className="w-4.5 h-4.5 group-hover:scale-110 transition-transform" />
                {hasPendingOffer ? 'Offer Pending — Make Another' : 'Make an Offer'}
              </button>
            )}

            {!user && listing.status === 'active' && (
              <a href="/login" className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-3 text-base">
                <CreditCard className="w-5 h-5" />Sign in to Buy — {formatZAR(total)}
              </a>
            )}
            {isOwnListing && (
              <div className="w-full py-3 bg-gray-100 text-gray-500 font-medium rounded-xl text-center text-sm flex items-center justify-center gap-2"><ShoppingBag className="w-4 h-4" />This is your listing</div>
            )}

            {/* Chat with Seller button */}
            {user && !isOwnListing && onStartChat && (
              <button onClick={handleOpenChat} className="w-full py-3 bg-emerald-50 text-emerald-700 font-semibold rounded-xl hover:bg-emerald-100 transition-all flex items-center justify-center gap-2 border border-emerald-200">
                <MessageSquare className="w-5 h-5" />Chat with Seller
              </button>
            )}

            {/* Quick message */}
            {user && !isOwnListing && (
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi, is this still available?" className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm" onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }} />
                  <button onClick={handleSendMessage} disabled={sendingMessage || !message.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 transition-all">
                    {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {user && (
                <button onClick={() => onToggleFavorite(listing.id)} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${isFavorited ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />{isFavorited ? 'Saved' : 'Save'}
                </button>
              )}
              {/* Wishlist Button */}
              {user && !isOwnListing && cart && (
                <button
                  onClick={() => cart.isInWishlist(listing.id) ? cart.removeFromWishlist(listing.id) : cart.addToWishlist(listing.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
                    cart.isInWishlist(listing.id)
                      ? 'bg-purple-50 text-purple-600 border border-purple-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-purple-50 hover:text-purple-600'
                  }`}
                >
                  <Bookmark className={`w-4 h-4 ${cart.isInWishlist(listing.id) ? 'fill-current' : ''}`} />
                  {cart.isInWishlist(listing.id) ? 'Wishlisted' : 'Wishlist'}
                </button>
              )}
              <ShareButton
                url={`/?listing=${listing.id}`}
                title={listing.title}
                price={formatZAR(listing.price)}
                imageUrl={listing.images?.[0]}
                contentType="listing"
                contentId={listing.id}
                variant="button"
              />
              {/* Price Alert Button */}
              {user && !isOwnListing && listing.status === 'active' && (
                <button
                  onClick={() => setPriceAlertOpen(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-medium hover:bg-indigo-100 transition-all border border-indigo-200"
                >
                  <BellRing className="w-4 h-4" />Price Alert
                </button>
              )}
            </div>

          </div>

        </div>
      </div>

      {/* Price Alert Modal */}
      {user && !isOwnListing && (
        <PriceAlertModal
          isOpen={priceAlertOpen}
          onClose={() => setPriceAlertOpen(false)}
          listingId={listing.id}
          listingTitle={listing.title}
          currentPrice={listing.price}
        />
      )}

      {/* Make Offer Modal */}
      {user && !isOwnListing && listing.is_negotiable && (
        <MakeOfferModal
          isOpen={offerModalOpen}
          onClose={() => setOfferModalOpen(false)}
          onSubmit={async (amount, msg) => {
            await createOffer({
              listing_id: listing.id,
              buyer_id: user.id,
              seller_id: listing.user_id,
              amount,
              message: msg,
            });
            // Also send a chat message about the offer
            await sendMessage(
              listing.id,
              user.id,
              listing.user_id,
              `[OFFER] I've made an offer of ${formatZAR(amount)} for "${listing.title}"${msg ? ` — ${msg}` : ''}`
            );
            setHasPendingOffer(true);
            toast({ title: 'Offer sent!', description: `Your offer of ${formatZAR(amount)} has been sent to the seller.` });
          }}
          listingPrice={listing.price}
          listingTitle={listing.title}
          listingImage={listing.images?.[0]}
          hasPendingOffer={hasPendingOffer}
        />
      )}
    </div>
  );
};

export default ListingDetail;

