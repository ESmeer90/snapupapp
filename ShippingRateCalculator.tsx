import React, { useState, useEffect, useCallback } from 'react';
import { formatZAR, getShippingRates } from '@/lib/api';
import type { ShippingRate } from '@/lib/api';
import { getAllShippingQuotes, getShippingTier, getShippingTierLabel } from '@/lib/shipping';

import type { SAProvince } from '@/types';
import {
  Truck, Package, Zap, Loader2, RefreshCw, AlertCircle,
  CheckCircle2, Clock, ChevronDown, ChevronUp, Info,
} from 'lucide-react';

export interface SelectedShippingOption {
  id: string;
  service: string;
  rate: number;
  delivery_days: string;
}

interface ShippingRateCalculatorProps {
  sellerProvince: string;
  buyerAddress: {
    street: string;
    city: string;
    postalCode: string;
    province: string;
  };
  onSelect: (option: SelectedShippingOption | null) => void;
  selectedOption: SelectedShippingOption | null;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  'sl_economy': <Package className="w-5 h-5" />,
  'sl_standard': <Truck className="w-5 h-5" />,
  'sl_express': <Zap className="w-5 h-5" />,
  'shiplogic-economy': <Package className="w-5 h-5" />,
  'shiplogic-standard': <Truck className="w-5 h-5" />,
  'shiplogic-express': <Zap className="w-5 h-5" />,
};

const SERVICE_COLORS: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  'sl_economy': { border: 'border-emerald-300', bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  'sl_standard': { border: 'border-blue-300', bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  'sl_express': { border: 'border-purple-300', bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  'shiplogic-economy': { border: 'border-emerald-300', bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  'shiplogic-standard': { border: 'border-blue-300', bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  'shiplogic-express': { border: 'border-purple-300', bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
};

const DEFAULT_COLORS = { border: 'border-gray-300', bg: 'bg-gray-50', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-700' };

const ShippingRateCalculator: React.FC<ShippingRateCalculatorProps> = ({
  sellerProvince,
  buyerAddress,
  onSelect,
  selectedOption,
}) => {
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);

  const isAddressComplete = buyerAddress.street.trim() && buyerAddress.city.trim() && buyerAddress.postalCode.trim() && buyerAddress.province;

  const fetchRates = useCallback(async () => {
    if (!isAddressComplete || !sellerProvince) return;
    setLoading(true);
    setError(null);

    try {
      const result = await getShippingRates({
        from_province: sellerProvince,
        to_address: buyerAddress,
      });

      if (result.rates.length > 0) {
        setRates(result.rates);
        setIsSimulated(result.simulated);
      } else {
        // Use flat-rate fallback from shipping.ts
        const flatRates = getAllShippingQuotes(
          sellerProvince as SAProvince,
          buyerAddress.province as SAProvince
        );
        const mappedRates: ShippingRate[] = flatRates.map(q => ({
          id: q.courier.id,
          service: q.courier.name,
          rate: q.cost,
          delivery_days: q.estimatedDays,
        }));
        setRates(mappedRates);
        setIsSimulated(true);
      }
      setHasFetched(true);
    } catch (err: any) {
      console.error('[ShippingRates] Fetch failed:', err);
      // Still try flat-rate fallback
      try {
        const flatRates = getAllShippingQuotes(
          sellerProvince as SAProvince,
          buyerAddress.province as SAProvince
        );
        const mappedRates: ShippingRate[] = flatRates.map(q => ({
          id: q.courier.id,
          service: q.courier.name,
          rate: q.cost,
          delivery_days: q.estimatedDays,
        }));
        setRates(mappedRates);
        setIsSimulated(true);
        setHasFetched(true);
      } catch {
        setError('Unable to calculate shipping rates. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [sellerProvince, buyerAddress.street, buyerAddress.city, buyerAddress.postalCode, buyerAddress.province, isAddressComplete]);

  // Auto-fetch when address is complete
  useEffect(() => {
    if (isAddressComplete && !hasFetched) {
      fetchRates();
    }
  }, [isAddressComplete, hasFetched, fetchRates]);

  // Reset when address changes
  useEffect(() => {
    setHasFetched(false);
    setRates([]);
    onSelect(null);
  }, [buyerAddress.province, buyerAddress.postalCode]);

  const handleSelect = (rate: ShippingRate) => {
    if (selectedOption?.id === rate.id) {
      onSelect(null);
    } else {
      onSelect({
        id: rate.id,
        service: rate.service,
        rate: rate.rate,
        delivery_days: rate.delivery_days,
      });
    }
  };

  // Don't render if address is not complete
  if (!isAddressComplete) {
    return null;
  }

  const tierLabel = (() => {
    try {
      const tier = getShippingTier(sellerProvince as SAProvince, buyerAddress.province as SAProvince);
      return getShippingTierLabel(tier);
    } catch {
      return sellerProvince === buyerAddress.province ? 'Same Province' : 'Inter-Province';
    }
  })();


  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${selectedOption ? 'bg-emerald-100' : 'bg-blue-100'}`}>
            {selectedOption ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <Truck className="w-4 h-4 text-blue-600" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-700">Shipping Options</h4>
            {selectedOption ? (
              <p className="text-xs text-gray-500">
                {selectedOption.service} — {formatZAR(selectedOption.rate)} ({selectedOption.delivery_days})
              </p>
            ) : (
              <p className="text-xs text-blue-600">Select a shipping method</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSimulated && rates.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
              Est.
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {/* Route Info */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Info className="w-3 h-3" />
              {sellerProvince} → {buyerAddress.province}
            </span>
            <span className="font-medium text-gray-600">{tierLabel}</span>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-6">
              <div className="text-center">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" />
                <p className="text-xs text-gray-500">Calculating shipping rates...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-red-700">{error}</p>
                <button
                  onClick={fetchRates}
                  className="text-xs text-red-600 hover:text-red-700 underline mt-1 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Try again
                </button>
              </div>
            </div>
          )}

          {/* Shipping Options */}
          {!loading && rates.length > 0 && (
            <div className="space-y-2">
              {rates.map((rate) => {
                const isSelected = selectedOption?.id === rate.id;
                const colors = SERVICE_COLORS[rate.id] || DEFAULT_COLORS;
                const icon = SERVICE_ICONS[rate.id] || <Truck className="w-5 h-5" />;
                const isCheapest = rate.rate === Math.min(...rates.map(r => r.rate));
                const isFastest = rate.rate === Math.max(...rates.map(r => r.rate)) && rates.length > 1;

                return (
                  <button
                    key={rate.id}
                    type="button"
                    onClick={() => handleSelect(rate)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? `${colors.border} ${colors.bg} ring-1 ring-offset-1 ring-current ${colors.text}`
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSelected ? colors.bg : 'bg-gray-100'
                      } ${isSelected ? colors.text : 'text-gray-500'}`}>
                        {icon}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-semibold ${isSelected ? colors.text : 'text-gray-900'}`}>
                            {rate.service}
                          </p>
                          {isCheapest && rates.length > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                              Best Value
                            </span>
                          )}
                          {isFastest && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                              Fastest
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-500">{rate.delivery_days} business days</span>
                        </div>
                      </div>

                      {/* Price + Radio */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <p className={`text-base font-bold ${isSelected ? colors.text : 'text-gray-900'}`}>
                          {formatZAR(rate.rate)}
                        </p>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? `${colors.border} ${colors.bg}`
                            : 'border-gray-300'
                        }`}>
                          {isSelected && (
                            <div className={`w-2.5 h-2.5 rounded-full ${
                              colors.text.replace('text-', 'bg-')
                            }`} />
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Simulated Notice */}
          {isSimulated && rates.length > 0 && !loading && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg">
              <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Estimated rates based on province distance. Actual rates may vary slightly and will be confirmed when the seller creates the shipment.
              </p>
            </div>
          )}

          {/* Refresh Button */}
          {hasFetched && !loading && (
            <button
              type="button"
              onClick={() => { setHasFetched(false); fetchRates(); }}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh rates
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ShippingRateCalculator;
