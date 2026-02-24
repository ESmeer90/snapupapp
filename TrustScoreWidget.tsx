import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Shield, ShieldCheck, Star, Clock, Package, Calendar, ChevronDown, ChevronUp,
  Loader2, Info, CheckCircle2, AlertCircle, TrendingUp
} from 'lucide-react';

// ============ TRUST SCORE CALCULATION ============

interface TrustFactors {
  verification: { score: number; max: number; label: string; detail: string };
  rating: { score: number; max: number; label: string; detail: string };
  responseTime: { score: number; max: number; label: string; detail: string };
  transactions: { score: number; max: number; label: string; detail: string };
  accountAge: { score: number; max: number; label: string; detail: string };
}

interface TrustScoreData {
  totalScore: number;
  maxScore: number;
  percentage: number;
  level: 'new' | 'building' | 'trusted' | 'verified' | 'top';
  levelLabel: string;
  factors: TrustFactors;
}

function calculateTrustScore(params: {
  isVerified: boolean;
  verificationStatus: string;
  avgRating: number;
  totalRatings: number;
  completedOrders: number;
  accountCreatedAt: string;
  totalMessages?: number;
  avgResponseMinutes?: number;
}): TrustScoreData {
  const factors: TrustFactors = {
    verification: { score: 0, max: 25, label: 'Verification', detail: '' },
    rating: { score: 0, max: 25, label: 'Seller Rating', detail: '' },
    responseTime: { score: 0, max: 15, label: 'Responsiveness', detail: '' },
    transactions: { score: 0, max: 20, label: 'Completed Sales', detail: '' },
    accountAge: { score: 0, max: 15, label: 'Account Age', detail: '' },
  };

  // 1. Verification (0-25)
  if (params.isVerified) {
    factors.verification.score = 25;
    factors.verification.detail = 'Identity verified';
  } else if (params.verificationStatus === 'pending') {
    factors.verification.score = 10;
    factors.verification.detail = 'Verification pending';
  } else {
    factors.verification.score = 0;
    factors.verification.detail = 'Not verified';
  }

  // 2. Rating (0-25)
  if (params.totalRatings > 0) {
    const ratingScore = (params.avgRating / 5) * 20;
    const volumeBonus = Math.min(params.totalRatings / 10, 1) * 5;
    factors.rating.score = Math.round(ratingScore + volumeBonus);
    factors.rating.detail = `${params.avgRating.toFixed(1)}/5 from ${params.totalRatings} reviews`;
  } else {
    factors.rating.score = 0;
    factors.rating.detail = 'No reviews yet';
  }

  // 3. Response time (0-15) - use real data from seller_metrics
  if (params.avgResponseMinutes !== undefined && params.avgResponseMinutes > 0) {
    if (params.avgResponseMinutes <= 30) {
      factors.responseTime.score = 15;
      factors.responseTime.detail = `Avg reply: ${Math.round(params.avgResponseMinutes)} min`;
    } else if (params.avgResponseMinutes <= 60) {
      factors.responseTime.score = 13;
      factors.responseTime.detail = `Avg reply: ${Math.round(params.avgResponseMinutes)} min`;
    } else if (params.avgResponseMinutes <= 120) {
      factors.responseTime.score = 11;
      const hrs = (params.avgResponseMinutes / 60).toFixed(1);
      factors.responseTime.detail = `Avg reply: ${hrs} hours`;
    } else if (params.avgResponseMinutes <= 360) {
      factors.responseTime.score = 8;
      const hrs = Math.round(params.avgResponseMinutes / 60);
      factors.responseTime.detail = `Avg reply: ~${hrs} hours`;
    } else if (params.avgResponseMinutes <= 720) {
      factors.responseTime.score = 5;
      const hrs = Math.round(params.avgResponseMinutes / 60);
      factors.responseTime.detail = `Avg reply: ~${hrs} hours`;
    } else if (params.avgResponseMinutes <= 1440) {
      factors.responseTime.score = 3;
      factors.responseTime.detail = 'Avg reply: ~1 day';
    } else {
      factors.responseTime.score = 1;
      const days = Math.round(params.avgResponseMinutes / 1440);
      factors.responseTime.detail = `Avg reply: ~${days} days`;
    }
  } else if ((params.totalMessages || 0) > 5) {
    factors.responseTime.score = 7;
    factors.responseTime.detail = 'Active communicator';
  } else if ((params.totalMessages || 0) > 0) {
    factors.responseTime.score = 3;
    factors.responseTime.detail = 'Some message activity';
  } else {
    factors.responseTime.score = 0;
    factors.responseTime.detail = 'No message history';
  }

  // 4. Completed transactions (0-20)
  if (params.completedOrders >= 50) {
    factors.transactions.score = 20;
    factors.transactions.detail = `${params.completedOrders} completed sales`;
  } else if (params.completedOrders >= 20) {
    factors.transactions.score = 16;
    factors.transactions.detail = `${params.completedOrders} completed sales`;
  } else if (params.completedOrders >= 10) {
    factors.transactions.score = 12;
    factors.transactions.detail = `${params.completedOrders} completed sales`;
  } else if (params.completedOrders >= 5) {
    factors.transactions.score = 8;
    factors.transactions.detail = `${params.completedOrders} completed sales`;
  } else if (params.completedOrders >= 1) {
    factors.transactions.score = 4;
    factors.transactions.detail = `${params.completedOrders} completed sale${params.completedOrders > 1 ? 's' : ''}`;
  } else {
    factors.transactions.score = 0;
    factors.transactions.detail = 'No completed sales';
  }

  // 5. Account age (0-15)
  const accountAgeMs = Date.now() - new Date(params.accountCreatedAt).getTime();
  const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);
  if (accountAgeDays >= 365) {
    factors.accountAge.score = 15;
    const years = Math.floor(accountAgeDays / 365);
    factors.accountAge.detail = `Member for ${years}+ year${years > 1 ? 's' : ''}`;
  } else if (accountAgeDays >= 180) {
    factors.accountAge.score = 12;
    factors.accountAge.detail = 'Member for 6+ months';
  } else if (accountAgeDays >= 90) {
    factors.accountAge.score = 9;
    factors.accountAge.detail = 'Member for 3+ months';
  } else if (accountAgeDays >= 30) {
    factors.accountAge.score = 5;
    factors.accountAge.detail = 'Member for 1+ month';
  } else {
    factors.accountAge.score = 2;
    factors.accountAge.detail = 'New member';
  }

  const totalScore = Object.values(factors).reduce((sum, f) => sum + f.score, 0);
  const maxScore = Object.values(factors).reduce((sum, f) => sum + f.max, 0);
  const percentage = Math.round((totalScore / maxScore) * 100);

  let level: TrustScoreData['level'];
  let levelLabel: string;
  if (percentage >= 85) { level = 'top'; levelLabel = 'Top Seller'; }
  else if (percentage >= 70) { level = 'verified'; levelLabel = 'Verified Seller'; }
  else if (percentage >= 50) { level = 'trusted'; levelLabel = 'Trusted'; }
  else if (percentage >= 25) { level = 'building'; levelLabel = 'Building Trust'; }
  else { level = 'new'; levelLabel = 'New Seller'; }

  return { totalScore, maxScore, percentage, level, levelLabel, factors };
}

// ============ CIRCULAR PROGRESS COMPONENT ============

const CircularProgress: React.FC<{ percentage: number; size?: number; strokeWidth?: number; color: string }> = ({
  percentage, size = 80, strokeWidth = 6, color
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-gray-100"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  );
};

// ============ FACTOR BAR COMPONENT ============

const FactorBar: React.FC<{ factor: TrustFactors[keyof TrustFactors]; icon: React.ReactNode; color: string }> = ({ factor, icon, color }) => {
  const pct = factor.max > 0 ? (factor.score / factor.max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium text-gray-700">{factor.label}</span>
          <span className="text-[10px] text-gray-400 font-medium">{factor.score}/{factor.max}</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%`, backgroundColor: pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444' }}
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 truncate">{factor.detail}</p>
      </div>
    </div>
  );
};

// ============ TRUST SCORE WIDGET ============

interface TrustScoreWidgetProps {
  sellerId: string;
  variant?: 'full' | 'compact' | 'badge';
  className?: string;
}

const TrustScoreWidget: React.FC<TrustScoreWidgetProps> = ({ sellerId, variant = 'full', className = '' }) => {
  const [trustData, setTrustData] = useState<TrustScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(variant === 'full');
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const loadTrustData = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      // Fetch all trust signals in parallel, including seller_metrics for real response time
      const [profileRes, ratingsRes, ordersRes, messagesRes, metricsRes] = await Promise.all([
        supabase.from('profiles').select('verified_seller, verification_status, created_at').eq('id', sellerId).single(),
        supabase.from('seller_ratings').select('rating').eq('seller_id', sellerId),
        supabase.from('orders').select('id').eq('seller_id', sellerId).eq('status', 'delivered'),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('sender_id', sellerId),
        supabase.from('seller_metrics').select('avg_response_minutes, total_conversations, total_replies').eq('seller_id', sellerId).maybeSingle(),
      ]);

      const profile = profileRes.data;
      const ratings = ratingsRes.data || [];
      const completedOrders = ordersRes.data?.length || 0;
      const totalMessages = messagesRes.count || 0;
      const metrics = metricsRes.data;

      const avgRating = ratings.length > 0
        ? Math.round((ratings.reduce((s, r: any) => s + r.rating, 0) / ratings.length) * 10) / 10
        : 0;

      // If no metrics exist yet, trigger a background calculation
      if (!metrics && totalMessages > 0) {
        supabase.functions.invoke('calculate-seller-metrics', {
          body: { action: 'calculate', seller_id: sellerId },
        }).catch(() => {});
      }

      const score = calculateTrustScore({
        isVerified: profile?.verified_seller || false,
        verificationStatus: profile?.verification_status || 'none',
        avgRating,
        totalRatings: ratings.length,
        completedOrders,
        accountCreatedAt: profile?.created_at || new Date().toISOString(),
        totalMessages,
        avgResponseMinutes: metrics?.avg_response_minutes || undefined,
      });

      setTrustData(score);
    } catch (err) {
      console.warn('Failed to load trust score:', err);
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => { loadTrustData(); }, [loadTrustData]);

  // Close tooltip on outside click
  useEffect(() => {
    if (!tooltipVisible) return;
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setTooltipVisible(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tooltipVisible]);

  if (loading) {
    if (variant === 'badge') return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 rounded-full text-[10px] text-gray-400"><Loader2 className="w-2.5 h-2.5 animate-spin" /></span>;
    if (variant === 'compact') return <div className={`inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl ${className}`}><Loader2 className="w-4 h-4 text-gray-300 animate-spin" /><span className="text-xs text-gray-400">Loading...</span></div>;
    return <div className={`flex items-center justify-center py-4 ${className}`}><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>;
  }

  if (!trustData) return null;

  const { percentage, level, levelLabel, factors } = trustData;

  const getColor = () => {
    if (percentage >= 85) return { ring: '#22c55e', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    if (percentage >= 70) return { ring: '#3b82f6', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    if (percentage >= 50) return { ring: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    if (percentage >= 25) return { ring: '#f97316', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' };
    return { ring: '#9ca3af', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' };
  };

  const colors = getColor();

  const getLevelIcon = () => {
    if (level === 'top') return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
    if (level === 'verified') return <ShieldCheck className="w-4 h-4 text-blue-500" />;
    if (level === 'trusted') return <Shield className="w-4 h-4 text-amber-500" />;
    return <Shield className="w-4 h-4 text-gray-400" />;
  };

  const factorBars = (
    <>
      <FactorBar factor={factors.verification} icon={<ShieldCheck className="w-3.5 h-3.5 text-blue-500" />} color="bg-blue-50" />
      <FactorBar factor={factors.rating} icon={<Star className="w-3.5 h-3.5 text-amber-500" />} color="bg-amber-50" />
      <FactorBar factor={factors.transactions} icon={<Package className="w-3.5 h-3.5 text-emerald-500" />} color="bg-emerald-50" />
      <FactorBar factor={factors.responseTime} icon={<Clock className="w-3.5 h-3.5 text-purple-500" />} color="bg-purple-50" />
      <FactorBar factor={factors.accountAge} icon={<Calendar className="w-3.5 h-3.5 text-indigo-500" />} color="bg-indigo-50" />
    </>
  );

  // ===== BADGE VARIANT =====
  if (variant === 'badge') {
    return (
      <div className="relative inline-block" ref={tooltipRef}>
        <button
          onClick={() => setTooltipVisible(!tooltipVisible)}
          className={`inline-flex items-center gap-1 px-2 py-0.5 ${colors.bg} ${colors.border} border rounded-full text-[10px] font-semibold ${colors.text} hover:opacity-80 transition-opacity cursor-pointer`}
          title={`Trust Score: ${percentage}% - ${levelLabel}`}
        >
          {getLevelIcon()}
          <span>{percentage}%</span>
        </button>

        {tooltipVisible && (
          <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-white rounded-xl border border-gray-200 shadow-xl p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-l border-t border-gray-200 rotate-45" />
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-100">
              <div className="relative w-12 h-12 flex-shrink-0">
                <CircularProgress percentage={percentage} size={48} strokeWidth={4} color={colors.ring} />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">{percentage}%</span>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  {getLevelIcon()}
                  <p className="text-sm font-bold text-gray-900">{levelLabel}</p>
                </div>
                <p className="text-[10px] text-gray-400">Trust Score</p>
              </div>
            </div>
            <div className="space-y-2">
              {factorBars}
            </div>
            <div className="mt-3 pt-2 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 flex items-start gap-1">
                <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                Based on verification, ratings, sales, response time & account age.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== COMPACT VARIANT =====
  if (variant === 'compact') {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${colors.bg} ${colors.border} border rounded-xl ${className}`}>
        <div className="relative w-8 h-8 flex-shrink-0">
          <CircularProgress percentage={percentage} size={32} strokeWidth={3} color={colors.ring} />
          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-gray-700">{percentage}</span>
        </div>
        <div className="min-w-0">
          <p className={`text-xs font-bold ${colors.text} leading-none`}>{levelLabel}</p>
          <p className="text-[10px] text-gray-400 leading-none mt-0.5">Trust Score</p>
        </div>
      </div>
    );
  }

  // ===== FULL VARIANT =====
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm ${className}`}>
      {/* Header with circular progress */}
      <div className={`p-5 ${colors.bg} border-b ${colors.border}`}>
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <CircularProgress percentage={percentage} size={88} strokeWidth={7} color={colors.ring} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black text-gray-900 leading-none">{percentage}%</span>
              <span className="text-[9px] text-gray-400 font-medium mt-0.5">TRUST</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              {getLevelIcon()}
              <h3 className={`text-base font-bold ${colors.text}`}>{levelLabel}</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              {percentage >= 85 ? 'This seller has an excellent track record with verified identity and high ratings.' :
               percentage >= 70 ? 'This seller is verified with a strong reputation and good transaction history.' :
               percentage >= 50 ? 'This seller has a decent track record. Check reviews for more details.' :
               percentage >= 25 ? 'This seller is building their reputation. Proceed with standard caution.' :
               'This is a new seller. Consider using buyer protection for added safety.'}
            </p>
          </div>
        </div>
      </div>

      {/* Expandable breakdown */}
      <div className="px-5 py-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Score Breakdown ({trustData.totalScore}/{trustData.maxScore} points)
          </span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expanded && (
          <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
            {factorBars}

            <div className="pt-3 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 flex items-start gap-1">
                <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                Trust scores are calculated from verification status, ratings, sales history, response time, and account age. Response times are measured from actual message data.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrustScoreWidget;
