import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatZAR } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  Bell, BellRing, X, Loader2, Check, Trash2, AlertCircle, TrendingDown, Mail
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface PriceAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  currentPrice: number;
}

interface PriceAlert {
  id: string;
  user_id: string;
  listing_id: string;
  target_price: number;
  is_active: boolean;
  triggered_at: string | null;
  notified_at: string | null;
  created_at: string;
}

const PriceAlertModal: React.FC<PriceAlertModalProps> = ({
  isOpen, onClose, listingId, listingTitle, currentPrice
}) => {
  const { user } = useAuth();
  const [targetPrice, setTargetPrice] = useState('');
  const [existingAlert, setExistingAlert] = useState<PriceAlert | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load existing alert - direct query (primary) with edge function fallback
  useEffect(() => {
    if (!isOpen || !user) return;
    setLoading(true);
    setSaved(false);

    const loadExisting = async () => {
      try {
        // PRIMARY: Direct query with RLS
        const { data: alert, error } = await supabase
          .from('price_alerts')
          .select('*')
          .eq('listing_id', listingId)
          .maybeSingle();

        if (!error && alert) {
          setExistingAlert(alert);
          setTargetPrice(String(alert.target_price));
        } else if (!error && !alert) {
          setExistingAlert(null);
          setTargetPrice(String(Math.round(currentPrice * 0.9)));
        } else {
          throw new Error(error?.message || 'Query failed');
        }
      } catch (directErr) {
        console.warn('[PriceAlertModal] Direct query failed, trying edge function:', directErr);
        try {
          const { data } = await supabase.functions.invoke('check-price-alerts', {
            body: { action: 'get-listing-alert', listing_id: listingId },
          });
          if (data?.alert) {
            setExistingAlert(data.alert);
            setTargetPrice(String(data.alert.target_price));
          } else {
            setExistingAlert(null);
            setTargetPrice(String(Math.round(currentPrice * 0.9)));
          }
        } catch {
          setTargetPrice(String(Math.round(currentPrice * 0.9)));
        }
      } finally {
        setLoading(false);
      }
    };

    loadExisting();
  }, [isOpen, user, listingId, currentPrice]);

  const handleSave = async () => {
    if (!user) return;
    const price = parseFloat(targetPrice);
    if (!price || price <= 0) {
      toast({ title: 'Invalid price', description: 'Please enter a valid target price', variant: 'destructive' });
      return;
    }
    if (price >= currentPrice) {
      toast({ title: 'Price too high', description: 'Target price should be below the current listing price', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Use edge function for upsert (needs cross-table validation: own listing check, conflict resolution)
      const { data, error } = await supabase.functions.invoke('check-price-alerts', {
        body: { action: 'upsert-alert', listing_id: listingId, target_price: price },
      });

      if (error) {
        // Try to get specific error from response
        const specificError = data?.error;
        if (specificError) throw new Error(specificError);
        throw new Error((error as any).message || 'Failed to set alert');
      }
      if (data?.error) throw new Error(data.error);

      setSaved(true);
      setExistingAlert(data.alert);

      if (data.already_met) {
        toast({
          title: 'Price already meets target!',
          description: `The current price (${formatZAR(data.current_price)}) is already at or below your target of ${formatZAR(price)}.`,
        });
      } else {
        toast({
          title: existingAlert ? 'Price alert updated!' : 'Price alert set!',
          description: `We'll email you when "${listingTitle}" drops to ${formatZAR(price)} or below.`,
        });
      }

      setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      console.error('[PriceAlertModal] Save error:', err);
      
      // If edge function fails, try direct upsert as fallback
      try {
        const { data: upsertData, error: upsertError } = await supabase
          .from('price_alerts')
          .upsert({
            user_id: user.id,
            listing_id: listingId,
            target_price: price,
            is_active: true,
            triggered_at: null,
            notified_at: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,listing_id' })
          .select()
          .single();

        if (!upsertError && upsertData) {
          setSaved(true);
          setExistingAlert(upsertData);
          toast({
            title: existingAlert ? 'Price alert updated!' : 'Price alert set!',
            description: `We'll notify you when "${listingTitle}" drops to ${formatZAR(price)} or below.`,
          });
          setTimeout(() => onClose(), 1500);
          return;
        }
        throw new Error(upsertError?.message || 'Failed to save alert');
      } catch (fallbackErr: any) {
        toast({ title: 'Error', description: err.message || 'Failed to set price alert', variant: 'destructive' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingAlert) return;
    setDeleting(true);
    try {
      // PRIMARY: Direct delete with RLS
      const { error: delError } = await supabase
        .from('price_alerts')
        .delete()
        .eq('id', existingAlert.id);

      if (delError) {
        console.warn('[PriceAlertModal] Direct delete failed, trying edge function:', delError.message);
        // FALLBACK: Edge function
        const { error } = await supabase.functions.invoke('check-price-alerts', {
          body: { action: 'delete-alert', alert_id: existingAlert.id },
        });
        if (error) throw new Error((error as any).message || 'Failed to delete alert');
      }

      toast({ title: 'Alert removed', description: 'Price alert has been removed.' });
      setExistingAlert(null);
      setTargetPrice(String(Math.round(currentPrice * 0.9)));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to remove alert', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  const priceNum = parseFloat(targetPrice) || 0;
  const discount = currentPrice > 0 ? Math.round(((currentPrice - priceNum) / currentPrice) * 100) : 0;
  const isValidPrice = priceNum > 0 && priceNum < currentPrice;

  const quickPrices = [
    { label: '5% off', price: Math.round(currentPrice * 0.95) },
    { label: '10% off', price: Math.round(currentPrice * 0.90) },
    { label: '15% off', price: Math.round(currentPrice * 0.85) },
    { label: '20% off', price: Math.round(currentPrice * 0.80) },
    { label: '25% off', price: Math.round(currentPrice * 0.75) },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <BellRing className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Set Price Alert</h3>
              <p className="text-blue-100 text-xs">Get notified when the price drops</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Listing info */}
              <div className="mb-5">
                <p className="text-sm text-gray-600 truncate mb-1">{listingTitle}</p>
                <p className="text-lg font-bold text-gray-900">Current price: {formatZAR(currentPrice)}</p>
              </div>

              {/* Existing alert notice */}
              {existingAlert && existingAlert.is_active && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2">
                  <Bell className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-blue-700">
                      Active alert at {formatZAR(existingAlert.target_price)}
                    </p>
                    <p className="text-[10px] text-blue-500 mt-0.5">
                      Set {new Date(existingAlert.created_at).toLocaleDateString('en-ZA')}
                    </p>
                  </div>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                    title="Remove alert"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              )}

              {existingAlert && !existingAlert.is_active && existingAlert.triggered_at && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-700">
                    This alert was triggered on {new Date(existingAlert.triggered_at).toLocaleDateString('en-ZA')}. Set a new target below.
                  </p>
                </div>
              )}

              {/* Target price input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Target Price (ZAR)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">R</span>
                  <input
                    type="number"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="Enter target price"
                    min={1}
                    max={currentPrice - 1}
                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-medium"
                  />
                </div>
                {isValidPrice && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-xs text-emerald-600 font-medium">
                      {discount}% below current price ({formatZAR(currentPrice - priceNum)} savings)
                    </span>
                  </div>
                )}
                {priceNum >= currentPrice && priceNum > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs text-amber-600">Target should be below current price</span>
                  </div>
                )}
              </div>

              {/* Quick price buttons */}
              <div className="mb-5">
                <p className="text-xs text-gray-500 mb-2">Quick select:</p>
                <div className="flex flex-wrap gap-2">
                  {quickPrices.map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => setTargetPrice(String(qp.price))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        String(qp.price) === targetPrice
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {qp.label} ({formatZAR(qp.price)})
                    </button>
                  ))}
                </div>
              </div>

              {/* Email notice */}
              <div className="mb-5 p-3 bg-gray-50 rounded-xl flex items-start gap-2">
                <Mail className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500">
                  You'll receive an email notification when the seller drops the price to your target or below.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !isValidPrice || saved}
                  className="flex-1 py-3 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Setting...</>
                  ) : saved ? (
                    <><Check className="w-4 h-4" /> Alert Set!</>
                  ) : (
                    <><Bell className="w-4 h-4" /> {existingAlert?.is_active ? 'Update Alert' : 'Set Alert'}</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PriceAlertModal;
