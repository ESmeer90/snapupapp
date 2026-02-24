import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSellerPromoStatus, formatZAR } from '@/lib/api';
import type { SellerPromoStatus } from '@/types';
import { Gift, Zap, TrendingUp, MapPin, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface PromoBannerProps {
  variant?: 'full' | 'compact' | 'inline';
  className?: string;
}

const PromoBanner: React.FC<PromoBannerProps> = ({ variant = 'full', className = '' }) => {
  const { user, profile } = useAuth();
  const [promoStatus, setPromoStatus] = useState<SellerPromoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const status = await getSellerPromoStatus(user.id);
        setPromoStatus(status);
      } catch (err) {
        console.warn('Failed to load promo status:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  if (loading) {
    return variant === 'inline' ? null : (
      <div className={`flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl ${className}`}>
        <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
        <span className="text-xs text-emerald-700">Checking promo status...</span>
      </div>
    );
  }

  if (!promoStatus?.has_active_promo || !promoStatus.promo) return null;

  const { promo, is_eligible, remaining_free_sales, usage_count, commission_saved } = promoStatus;
  const maxSales = promo.max_sales || 10;
  const progressPct = Math.min(100, (usage_count / maxSales) * 100);
  const isTargetProvince = promo.target_provinces?.includes(profile?.province || '');

  // Compact inline version for forms/modals
  if (variant === 'inline') {
    if (!is_eligible) return null;
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg ${className}`}>
        <Gift className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <p className="text-xs text-emerald-800">
          <span className="font-bold">Launch Promo Active:</span> 0% commission on your first {maxSales} sales!
          <span className="text-emerald-600 ml-1">({remaining_free_sales} remaining)</span>
        </p>
      </div>
    );
  }

  // Compact banner
  if (variant === 'compact') {
    return (
      <div className={`bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl p-3 text-white ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold">
                {is_eligible ? `${remaining_free_sales} Free Sales Left` : 'Promo Complete'}
              </p>
              <p className="text-xs text-white/80">
                {is_eligible ? '0% commission on each' : `Saved ${formatZAR(commission_saved)} total`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/70">{usage_count}/{maxSales} used</p>
            <div className="w-20 h-1.5 bg-white/20 rounded-full mt-1">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full banner
  return (
    <div className={`bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 rounded-2xl overflow-hidden shadow-lg shadow-emerald-200 ${className}`}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Gift className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{promo.name}</h3>
              <p className="text-sm text-white/80 mt-0.5">
                {is_eligible
                  ? `You're on our Launch Promo: 0% commission on your first ${maxSales} sales!`
                  : `Promo complete! You saved ${formatZAR(commission_saved)} in commission.`
                }
              </p>
              {isTargetProvince && (
                <div className="flex items-center gap-1 mt-1.5">
                  <MapPin className="w-3 h-3 text-emerald-200" />
                  <span className="text-xs text-emerald-200 font-medium">
                    Priority region: {profile?.province}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-white/70 mb-1.5">
            <span>{usage_count} of {maxSales} free sales used</span>
            <span>{remaining_free_sales} remaining</span>
          </div>
          <div className="w-full h-3 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Expandable Details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mt-3 text-xs text-white/70 hover:text-white transition-colors"
        >
          {expanded ? 'Hide details' : 'View details'}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {expanded && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-white">{remaining_free_sales}</p>
              <p className="text-[10px] text-white/70 mt-0.5">Free Sales Left</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-white">{formatZAR(commission_saved)}</p>
              <p className="text-[10px] text-white/70 mt-0.5">Commission Saved</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-white">
                {is_eligible ? '0%' : '5-12%'}
              </p>
              <p className="text-[10px] text-white/70 mt-0.5">Current Rate</p>
            </div>
            <div className="col-span-2 sm:col-span-3 bg-white/10 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-200 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-white/90 font-medium">After promo ends</p>
                  <p className="text-[10px] text-white/70 mt-0.5">
                    Standard tiered commission applies: 12% under R500, 10% for R500-R2,000, 5% over R2,000. 
                    No listing fees — commission only on successful sales.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CPA/POPIA compliance footer */}
      <div className="px-5 py-2 bg-black/10 text-[10px] text-white/50">
        Promo terms: 0% commission on first {maxSales} delivered orders. Standard rates apply after. POPIA/CPA compliant.
        {promo.target_provinces?.length > 0 && ` Prioritized for ${promo.target_provinces.join(', ')} sellers.`}
      </div>
    </div>
  );
};

export default PromoBanner;
