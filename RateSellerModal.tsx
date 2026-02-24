import React, { useState } from 'react';
import { submitSellerRating } from '@/lib/api';
import { X, Star, Loader2, Send, Shield } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface RateSellerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sellerId: string;
  buyerId: string;
  orderId: string;
  sellerName?: string;
  listingTitle?: string;
  onRated: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Below Average',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

const RateSellerModal: React.FC<RateSellerModalProps> = ({
  isOpen, onClose, sellerId, buyerId, orderId, sellerName, listingTitle, onRated
}) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast({ title: 'Rating required', description: 'Please select a star rating.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await submitSellerRating({
        seller_id: sellerId,
        buyer_id: buyerId,
        order_id: orderId,
        rating,
        review: review.trim() || undefined,
      });
      toast({ title: 'Rating submitted', description: 'Thank you for your feedback!' });
      onRated();
      onClose();
    } catch (err: any) {
      const msg = err.message?.includes('duplicate')
        ? 'You have already rated this order.'
        : err.message || 'Failed to submit rating';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const activeRating = hoverRating || rating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Rate Seller</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {sellerName ? `How was your experience with ${sellerName}?` : 'How was your experience?'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Listing Info */}
          {listingTitle && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-0.5">Item purchased</p>
              <p className="text-sm font-medium text-gray-900 truncate">{listingTitle}</p>
            </div>
          )}

          {/* Star Rating */}
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 mb-3">Tap a star to rate</p>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      star <= activeRating
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            {activeRating > 0 && (
              <p className={`text-sm font-semibold mt-2 ${
                activeRating >= 4 ? 'text-emerald-600' : activeRating >= 3 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {RATING_LABELS[activeRating]}
              </p>
            )}
          </div>

          {/* Review Text */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Review (optional)
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
              placeholder="Share your experience with this seller..."
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{review.length}/500</p>
          </div>

          {/* POPIA Notice */}
          <div className="flex items-start gap-2 text-xs text-gray-400">
            <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" />
            <span>Your review is displayed anonymously per POPIA. Only your first initial will be shown.</span>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || rating === 0}
              className="flex-1 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RateSellerModal;
