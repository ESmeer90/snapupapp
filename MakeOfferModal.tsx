import React, { useState, useEffect } from 'react';
import { formatZAR } from '@/lib/api';
import { X, Loader2, Tag, AlertTriangle, TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface MakeOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (amount: number, message?: string) => Promise<void>;
  listingPrice: number;
  listingTitle: string;
  listingImage?: string;
  hasPendingOffer?: boolean;
}

const MakeOfferModal: React.FC<MakeOfferModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  listingPrice,
  listingTitle,
  listingImage,
  hasPendingOffer = false,
}) => {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Min/max bounds: 10% to 100% of listing price
  const minOffer = Math.max(1, Math.round(listingPrice * 0.1));
  const maxOffer = listingPrice;

  // Quick offer presets
  const presets = [
    { label: '10% off', amount: Math.round(listingPrice * 0.9) },
    { label: '20% off', amount: Math.round(listingPrice * 0.8) },
    { label: '30% off', amount: Math.round(listingPrice * 0.7) },
  ];

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setMessage('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const numericAmount = Number(amount);
  const isValid = numericAmount >= minOffer && numericAmount <= maxOffer;
  const discount = listingPrice > 0 ? Math.round(((listingPrice - numericAmount) / listingPrice) * 100) : 0;

  const getDiscountColor = () => {
    if (!numericAmount || numericAmount <= 0) return 'text-gray-400';
    if (discount <= 10) return 'text-emerald-600';
    if (discount <= 25) return 'text-amber-600';
    return 'text-red-600';
  };

  const getDiscountIcon = () => {
    if (!numericAmount || numericAmount <= 0) return Minus;
    if (discount <= 10) return TrendingUp;
    if (discount <= 25) return Minus;
    return TrendingDown;
  };

  const DiscountIcon = getDiscountIcon();

  const handleSubmit = async () => {
    if (!isValid) {
      setError(`Offer must be between ${formatZAR(minOffer)} and ${formatZAR(maxOffer)}`);
      return;
    }
    if (hasPendingOffer) {
      setError('You already have a pending offer on this listing');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(numericAmount, message.trim() || undefined);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit offer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Tag className="w-4.5 h-4.5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Make an Offer</h3>
              <p className="text-[11px] text-gray-500">Negotiate the price with the seller</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/80 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Listing Preview */}
        <div className="mx-5 mt-4 flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
          {listingImage ? (
            <img src={listingImage} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gray-200 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{listingTitle}</p>
            <p className="text-base font-black text-blue-600">{formatZAR(listingPrice)}</p>
          </div>
        </div>

        {/* Offer Amount Input */}
        <div className="px-5 pt-4">
          <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Your Offer Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">R</span>
            <input
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(''); }}
              placeholder="0"
              min={minOffer}
              max={maxOffer}
              className="w-full pl-9 pr-4 py-3.5 bg-white border-2 border-gray-200 rounded-xl text-lg font-bold text-gray-900 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all placeholder:text-gray-300"
              autoFocus
            />
          </div>

          {/* Discount indicator */}
          {numericAmount > 0 && (
            <div className={`flex items-center gap-1.5 mt-2 ${getDiscountColor()}`}>
              <DiscountIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">
                {discount > 0 ? `${discount}% below asking price` : discount === 0 ? 'Full price' : 'Above asking price'}
              </span>
            </div>
          )}

          {/* Range hint */}
          <p className="text-[11px] text-gray-400 mt-1.5">
            Offer range: {formatZAR(minOffer)} — {formatZAR(maxOffer)}
          </p>
        </div>

        {/* Quick Presets */}
        <div className="px-5 pt-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Quick Offers</p>
          <div className="flex gap-2">
            {presets.map(preset => (
              <button
                key={preset.label}
                onClick={() => { setAmount(String(preset.amount)); setError(''); }}
                className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl border-2 transition-all ${
                  numericAmount === preset.amount
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-200 hover:bg-emerald-50/50'
                }`}
              >
                <div className="text-[10px] text-gray-400">{preset.label}</div>
                <div>{formatZAR(preset.amount)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Optional Message */}
        <div className="px-5 pt-3">
          <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Message (optional)</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="e.g. I can collect today..."
            maxLength={200}
            rows={2}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-300 outline-none resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Pending offer warning */}
        {hasPendingOffer && (
          <div className="mx-5 mt-3 flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700">You already have a pending offer. Wait for the seller to respond before making a new one.</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 py-4 mt-2 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting || hasPendingOffer}
            className="flex-1 px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Tag className="w-4 h-4" />
            )}
            {submitting ? 'Sending...' : `Offer ${numericAmount > 0 ? formatZAR(numericAmount) : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MakeOfferModal;
