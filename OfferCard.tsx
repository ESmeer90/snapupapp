import React, { useState } from 'react';
import { formatZAR, updateOfferStatus, createOffer, sendMessage } from '@/lib/api';
import type { Offer, OfferStatus } from '@/types';
import { OFFER_STATUS_CONFIG } from '@/types';
import {
  Tag, CheckCircle2, XCircle, ArrowLeftRight, Clock, Undo2,
  Loader2, ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface OfferCardProps {
  offer: Offer;
  currentUserId: string;
  listingTitle?: string;
  listingPrice?: number;
  onOfferUpdated?: (offer: Offer) => void;
  onAcceptAndBuy?: (offer: Offer) => void;
}

const STATUS_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeftRight,
  Undo2,
};

const OfferCard: React.FC<OfferCardProps> = ({
  offer,
  currentUserId,
  listingTitle,
  listingPrice,
  onOfferUpdated,
  onAcceptAndBuy,
}) => {
  const [loading, setLoading] = useState(false);
  const [counterMode, setCounterMode] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterError, setCounterError] = useState('');

  const isBuyer = offer.buyer_id === currentUserId;
  const isSeller = offer.seller_id === currentUserId;
  const isPending = offer.status === 'pending';
  const isCountered = offer.status === 'countered';
  const statusConfig = OFFER_STATUS_CONFIG[offer.status];
  const StatusIcon = STATUS_ICONS[statusConfig.icon] || Clock;

  const discount = listingPrice && listingPrice > 0
    ? Math.round(((listingPrice - offer.amount) / listingPrice) * 100)
    : 0;

  const handleAccept = async () => {
    setLoading(true);
    try {
      const updated = await updateOfferStatus(offer.id, 'accepted');
      toast({ title: 'Offer accepted!', description: `You accepted the offer of ${formatZAR(offer.amount)}.` });
      if (onOfferUpdated) onOfferUpdated({ ...offer, ...updated });
      if (onAcceptAndBuy) onAcceptAndBuy({ ...offer, ...updated });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to accept offer', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    setLoading(true);
    try {
      const updated = await updateOfferStatus(offer.id, 'declined');
      toast({ title: 'Offer declined', description: 'The buyer will be notified.' });
      if (onOfferUpdated) onOfferUpdated({ ...offer, ...updated });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to decline offer', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    setLoading(true);
    try {
      const updated = await updateOfferStatus(offer.id, 'withdrawn');
      toast({ title: 'Offer withdrawn', description: 'Your offer has been withdrawn.' });
      if (onOfferUpdated) onOfferUpdated({ ...offer, ...updated });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to withdraw offer', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCounter = async () => {
    const numCounter = Number(counterAmount);
    if (!numCounter || numCounter <= 0) {
      setCounterError('Enter a valid amount');
      return;
    }
    if (numCounter <= offer.amount) {
      setCounterError('Counter must be higher than the offer');
      return;
    }
    if (listingPrice && numCounter > listingPrice) {
      setCounterError('Counter cannot exceed the listing price');
      return;
    }
    setLoading(true);
    try {
      const updated = await updateOfferStatus(offer.id, 'countered', numCounter);
      toast({ title: 'Counter offer sent!', description: `You countered with ${formatZAR(numCounter)}.` });
      setCounterMode(false);
      setCounterAmount('');
      if (onOfferUpdated) onOfferUpdated({ ...offer, ...updated, counter_amount: numCounter });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to send counter offer', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptCounter = async () => {
    if (!offer.counter_amount) return;
    setLoading(true);
    try {
      const updated = await updateOfferStatus(offer.id, 'accepted');
      toast({ title: 'Counter accepted!', description: `Deal agreed at ${formatZAR(offer.counter_amount)}.` });
      if (onOfferUpdated) onOfferUpdated({ ...offer, ...updated, status: 'accepted' });
      if (onAcceptAndBuy) onAcceptAndBuy({ ...offer, ...updated, status: 'accepted', amount: offer.counter_amount });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to accept counter', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineCounter = async () => {
    setLoading(true);
    try {
      const updated = await updateOfferStatus(offer.id, 'declined');
      toast({ title: 'Counter declined', description: 'You can make a new offer.' });
      if (onOfferUpdated) onOfferUpdated({ ...offer, ...updated, status: 'declined' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to decline counter', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Determine card alignment (buyer's offers on right, seller's on left)
  const isOwnOffer = isBuyer;

  return (
    <div className={`flex ${isOwnOffer ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] sm:max-w-[75%] ${isOwnOffer ? 'order-1' : ''}`}>
        <div className={`rounded-2xl overflow-hidden border-2 shadow-sm ${
          offer.status === 'accepted' ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50' :
          offer.status === 'declined' ? 'border-red-200 bg-gradient-to-br from-red-50 to-rose-50' :
          offer.status === 'countered' ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50' :
          offer.status === 'pending' ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50' :
          'border-gray-200 bg-gray-50'
        }`}>
          {/* Offer Header */}
          <div className="px-4 py-2.5 flex items-center gap-2 border-b border-black/5">
            <Tag className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
              {isBuyer ? 'Your Offer' : `Offer from ${offer.buyer_name || 'Buyer'}`}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <StatusIcon className={`w-3 h-3 ${statusConfig.color}`} />
              <span className={`text-[10px] font-bold ${statusConfig.color} ${statusConfig.bg} px-1.5 py-0.5 rounded-full`}>
                {statusConfig.label}
              </span>
            </div>
          </div>

          {/* Offer Amount */}
          <div className="px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-gray-900">{formatZAR(offer.amount)}</span>
              {listingPrice && discount > 0 && (
                <span className="text-xs font-medium text-gray-400 line-through">{formatZAR(listingPrice)}</span>
              )}
            </div>
            {discount > 0 && (
              <p className="text-xs text-amber-600 font-medium mt-0.5">{discount}% below asking price</p>
            )}
            {offer.message && (
              <p className="text-sm text-gray-600 mt-2 italic">"{offer.message}"</p>
            )}

            {/* Counter amount display */}
            {offer.status === 'countered' && offer.counter_amount && (
              <div className="mt-3 p-2.5 bg-blue-100/60 rounded-xl border border-blue-200">
                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-0.5">Counter Offer</p>
                <p className="text-xl font-black text-blue-700">{formatZAR(offer.counter_amount)}</p>
              </div>
            )}

            {/* Accepted amount display */}
            {offer.status === 'accepted' && (
              <div className="mt-3 p-2.5 bg-emerald-100/60 rounded-xl border border-emerald-200">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <p className="text-xs font-bold text-emerald-700">
                    Deal agreed at {formatZAR(offer.counter_amount || offer.amount)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {!loading && (
            <div className="px-4 pb-3">
              {/* Seller actions on pending offer */}
              {isSeller && isPending && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      onClick={handleAccept}
                      className="flex-1 py-2 px-3 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                    </button>
                    <button
                      onClick={handleDecline}
                      className="flex-1 py-2 px-3 bg-red-500 text-white text-xs font-bold rounded-xl hover:bg-red-600 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Decline
                    </button>
                  </div>
                  <button
                    onClick={() => setCounterMode(!counterMode)}
                    className="w-full py-2 px-3 bg-blue-100 text-blue-700 text-xs font-bold rounded-xl hover:bg-blue-200 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" /> Counter Offer
                    {counterMode ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {/* Counter input */}
                  {counterMode && (
                    <div className="p-3 bg-white rounded-xl border border-blue-200 space-y-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">R</span>
                        <input
                          type="number"
                          value={counterAmount}
                          onChange={e => { setCounterAmount(e.target.value); setCounterError(''); }}
                          placeholder="Your counter amount"
                          className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-300 outline-none"
                          min={offer.amount + 1}
                          max={listingPrice}
                        />
                      </div>
                      {counterError && <p className="text-[11px] text-red-500">{counterError}</p>}
                      <button
                        onClick={handleCounter}
                        className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Send Counter — {counterAmount ? formatZAR(Number(counterAmount)) : 'R0'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Buyer actions on pending offer */}
              {isBuyer && isPending && (
                <button
                  onClick={handleWithdraw}
                  className="w-full py-2 px-3 bg-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Withdraw Offer
                </button>
              )}

              {/* Buyer actions on countered offer */}
              {isBuyer && isCountered && offer.counter_amount && (
                <div className="flex gap-2">
                  <button
                    onClick={handleAcceptCounter}
                    className="flex-1 py-2 px-3 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Accept {formatZAR(offer.counter_amount)}
                  </button>
                  <button
                    onClick={handleDeclineCounter}
                    className="flex-1 py-2 px-3 bg-red-500 text-white text-xs font-bold rounded-xl hover:bg-red-600 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Decline
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="px-4 pb-3 flex items-center justify-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Processing...</span>
            </div>
          )}

          {/* Timestamp */}
          <div className="px-4 pb-2.5 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              {new Date(offer.created_at).toLocaleDateString('en-ZA', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
              })}
            </span>
            {offer.updated_at !== offer.created_at && (
              <span className="text-[10px] text-gray-400">
                Updated {new Date(offer.updated_at).toLocaleDateString('en-ZA', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfferCard;
