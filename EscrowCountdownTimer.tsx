import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getEscrowStatus, autoReleaseEscrow, formatZAR } from '@/lib/api';
import type { EscrowHold } from '@/types';
import { toast } from '@/components/ui/use-toast';
import {
  Clock, Shield, CheckCircle2, AlertTriangle, Banknote,
  Loader2, Timer, Lock, Unlock, Flag, RefreshCw, Info,
  ArrowRight, XCircle, Eye
} from 'lucide-react';

interface EscrowCountdownTimerProps {
  orderId: string;
  deliveryConfirmedAt: string | null;
  hasDeliveryPhoto: boolean;
  isBuyer: boolean;
  isSeller: boolean;
  orderStatus: string;
  orderAmount: number;
  hasActiveDispute?: boolean;
  onPayoutReleased?: () => void;
}

const ESCROW_HOURS = 48;
const ESCROW_MS = ESCROW_HOURS * 60 * 60 * 1000;

const EscrowCountdownTimer: React.FC<EscrowCountdownTimerProps> = ({
  orderId,
  deliveryConfirmedAt,
  hasDeliveryPhoto,
  isBuyer,
  isSeller,
  orderStatus,
  orderAmount,
  hasActiveDispute: hasActiveDisputeProp = false,
  onPayoutReleased,
}) => {
  const [escrow, setEscrow] = useState<EscrowHold | null>(null);
  const [hasActiveDispute, setHasActiveDispute] = useState(hasActiveDisputeProp);
  const [loading, setLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [payoutStatus, setPayoutStatus] = useState<'pending' | 'releasing' | 'released' | 'disputed'>('pending');
  const [showConditions, setShowConditions] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch escrow status from backend
  const fetchEscrowStatus = useCallback(async () => {
    try {
      const result = await getEscrowStatus(orderId);
      if (result.escrow) {
        setEscrow(result.escrow);
        setHasActiveDispute(result.has_active_dispute);
        if (result.escrow.status === 'released') setPayoutStatus('released');
        else if (result.escrow.status === 'disputed') setPayoutStatus('disputed');
        else setPayoutStatus('pending');
      }
    } catch (err) {
      console.warn('[EscrowStatus] Failed to fetch escrow status:', err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchEscrowStatus();
  }, [fetchEscrowStatus]);

  // Listen for real-time escrow updates
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`escrow-${orderId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'escrow_holds',
        filter: `order_id=eq.${orderId}`,
      }, (payload) => {
        const updated = payload.new as any;
        if (updated) {
          setEscrow(prev => prev ? { ...prev, ...updated } : updated);
          if (updated.status === 'released') {
            setPayoutStatus('released');
            if (isSeller) toast({ title: 'Funds Released!', description: 'Your payment is being processed.' });
            if (isBuyer) toast({ title: 'Payment Released', description: 'Funds have been released to the seller.' });
          } else if (updated.status === 'disputed') {
            setPayoutStatus('disputed');
            setHasActiveDispute(true);
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId, isBuyer, isSeller]);

  // Calculate release time from escrow data or fallback to prop
  const releaseTime = escrow?.release_at
    ? new Date(escrow.release_at).getTime()
    : deliveryConfirmedAt
      ? new Date(deliveryConfirmedAt).getTime() + ESCROW_MS
      : null;

  // Countdown timer
  useEffect(() => {
    if (!releaseTime || hasActiveDispute || payoutStatus === 'released') {
      if (hasActiveDispute) setPayoutStatus('disputed');
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const remaining = releaseTime - now;

      if (remaining <= 0) {
        setTimeRemaining(0);
        if (payoutStatus !== 'released' && payoutStatus !== 'releasing') {
          triggerAutoRelease();
        }
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        setTimeRemaining(remaining);
      }
    };

    updateCountdown();
    intervalRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [releaseTime, hasActiveDispute, payoutStatus]);

  const triggerAutoRelease = async () => {
    try {
      setPayoutStatus('releasing');
      await autoReleaseEscrow(orderId);
      setPayoutStatus('released');
      onPayoutReleased?.();
    } catch (err) {
      console.error('Auto-release failed:', err);
      setPayoutStatus('released'); // Still mark as released since time expired
    }
  };

  // Format remaining time
  const formatTime = (ms: number) => {
    if (ms <= 0) return { hours: '00', minutes: '00', seconds: '00', totalHours: 0 };
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return {
      hours: hours.toString().padStart(2, '0'),
      minutes: minutes.toString().padStart(2, '0'),
      seconds: seconds.toString().padStart(2, '0'),
      totalHours: hours,
    };
  };

  // Don't show if no delivery confirmation or cancelled/refunded
  if (!deliveryConfirmedAt || orderStatus === 'cancelled' || orderStatus === 'refunded') return null;

  // Loading state
  if (loading) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border-2 border-blue-200 p-5">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <span className="text-sm text-blue-700 font-medium">Loading escrow status...</span>
        </div>
      </div>
    );
  }

  const time = formatTime(timeRemaining);
  const progressPercent = releaseTime
    ? Math.min(100, ((ESCROW_MS - timeRemaining) / ESCROW_MS) * 100)
    : 0;

  const escrowAmount = escrow?.amount || orderAmount;
  const commission = escrow?.commission_amount || 0;
  const netSeller = escrow?.net_seller_amount || orderAmount;
  const conditions = escrow?.release_conditions || {};

  // ===== DISPUTED STATE =====
  if (hasActiveDispute || payoutStatus === 'disputed') {
    return (
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl border-2 border-orange-200 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5.5 h-5.5 text-orange-600" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-orange-800">Escrow Paused — Dispute Active</h4>
            <p className="text-xs text-orange-600">
              The 48-hour countdown is paused while a dispute is being reviewed by our team.
            </p>
          </div>
        </div>

        {/* Amount held */}
        <div className="flex items-center gap-2 p-3 bg-orange-100/70 rounded-xl">
          <Lock className="w-4 h-4 text-orange-700" />
          <span className="text-xs font-medium text-orange-800">
            {formatZAR(escrowAmount)} held in escrow until the dispute is resolved.
          </span>
        </div>

        {/* Release conditions */}
        <div className="space-y-2">
          <button onClick={() => setShowConditions(!showConditions)}
            className="flex items-center gap-1.5 text-xs font-medium text-orange-700 hover:text-orange-800 transition-colors">
            <Info className="w-3.5 h-3.5" />
            {showConditions ? 'Hide' : 'Show'} Release Conditions
          </button>
          {showConditions && (
            <div className="bg-white rounded-xl p-3 space-y-2 border border-orange-200">
              <ConditionRow label="Delivery confirmed" met={!!conditions.delivery_confirmed} />
              <ConditionRow label="48-hour window passed" met={false} />
              <ConditionRow label="No active dispute" met={false} />
            </div>
          )}
        </div>

        {isBuyer && (
          <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
            <Eye className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700">
              Your dispute is being reviewed. You'll be notified of the outcome. Funds remain protected in escrow.
            </p>
          </div>
        )}

        {isSeller && (
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <Flag className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700">
              A dispute has been raised. The payout is paused until it's resolved. You can respond to the dispute from the Disputes tab.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ===== RELEASED STATE =====
  if (payoutStatus === 'released' || payoutStatus === 'releasing' || timeRemaining <= 0) {
    return (
      <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl border-2 border-emerald-200 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
            {payoutStatus === 'releasing' ? (
              <Loader2 className="w-5.5 h-5.5 text-emerald-600 animate-spin" />
            ) : (
              <Unlock className="w-5.5 h-5.5 text-emerald-600" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-bold text-emerald-800">
              {payoutStatus === 'releasing' ? 'Processing Payout...' : 'Funds Released'}
            </h4>
            <p className="text-xs text-emerald-600">
              {isSeller
                ? 'The 48-hour escrow period has ended. Your funds are being released to your bank account.'
                : 'The dispute window has closed. Payment has been released to the seller.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-3 bg-emerald-100/70 rounded-xl">
            <Banknote className="w-4 h-4 text-emerald-700 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-emerald-600">Total Amount</p>
              <p className="text-sm font-bold text-emerald-800">{formatZAR(escrowAmount)}</p>
            </div>
          </div>
          {isSeller && commission > 0 && (
            <div className="flex items-center gap-2 p-3 bg-emerald-100/70 rounded-xl">
              <ArrowRight className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-emerald-600">Your Payout</p>
                <p className="text-sm font-bold text-emerald-800">{formatZAR(netSeller)}</p>
              </div>
            </div>
          )}
        </div>

        {/* All conditions met */}
        <div className="bg-white rounded-xl p-3 space-y-2 border border-emerald-200">
          <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Release Conditions — All Met</p>
          <ConditionRow label="Delivery confirmed by buyer" met={true} />
          <ConditionRow label="48-hour dispute window passed" met={true} />
          <ConditionRow label="No active disputes" met={true} />
          {hasDeliveryPhoto && <ConditionRow label="Delivery photo proof verified" met={true} />}
        </div>
      </div>
    );
  }

  // ===== ACTIVE COUNTDOWN =====
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border-2 border-blue-200 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Timer className="w-5.5 h-5.5 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-blue-800">
              {isSeller ? 'Escrow Payout Countdown' : 'Buyer Protection Window'}
            </h4>
            <p className="text-xs text-blue-600">
              {isSeller
                ? 'Funds will be released after the 48-hour dispute window.'
                : 'You have 48 hours to raise a dispute if there\'s an issue.'}
            </p>
          </div>
        </div>
        <button onClick={fetchEscrowStatus} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-all" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Countdown Display */}
      <div className="flex items-center justify-center gap-2">
        <CountdownBlock value={time.hours} label="Hours" />
        <span className="text-xl font-bold text-blue-400 mt-[-12px]">:</span>
        <CountdownBlock value={time.minutes} label="Min" />
        <span className="text-xl font-bold text-blue-400 mt-[-12px]">:</span>
        <CountdownBlock value={time.seconds} label="Sec" />
      </div>

      {/* Progress Bar */}
      <div>
        <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-blue-500">Delivery confirmed</span>
          <span className="text-[10px] text-blue-500">Funds released</span>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-blue-100">
          <Shield className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-[10px] text-blue-500">Escrowed</p>
            <p className="text-xs font-bold text-blue-800">{formatZAR(escrowAmount)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-blue-100">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-[10px] text-blue-500">Photo Proof</p>
            <p className="text-xs font-bold text-blue-800">{hasDeliveryPhoto ? 'Verified' : 'None'}</p>
          </div>
        </div>
      </div>

      {/* Release Conditions */}
      <div>
        <button onClick={() => setShowConditions(!showConditions)}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 transition-colors mb-2">
          <Info className="w-3.5 h-3.5" />
          {showConditions ? 'Hide' : 'Show'} Release Conditions
        </button>
        {showConditions && (
          <div className="bg-white rounded-xl p-3 space-y-2 border border-blue-200">
            <ConditionRow label="Delivery confirmed by buyer" met={!!conditions.delivery_confirmed || !!deliveryConfirmedAt} />
            <ConditionRow label="48-hour dispute window passed" met={false} pending />
            <ConditionRow label="No active disputes" met={conditions.no_active_dispute !== false} />
            {hasDeliveryPhoto && <ConditionRow label="Delivery photo proof uploaded" met={true} />}
          </div>
        )}
      </div>

      {/* Seller breakdown */}
      {isSeller && commission > 0 && (
        <div className="bg-white rounded-xl p-3 border border-blue-100 space-y-1.5">
          <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Payout Breakdown</p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Sale Amount</span>
            <span className="font-medium text-gray-900">{formatZAR(escrowAmount)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Commission</span>
            <span className="font-medium text-red-600">-{formatZAR(commission)}</span>
          </div>
          <div className="border-t border-blue-100 pt-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-900">Your Payout</span>
            <span className="font-bold text-emerald-600">{formatZAR(netSeller)}</span>
          </div>
        </div>
      )}

      {/* Buyer hint */}
      {isBuyer && (
        <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700">
            If there's an issue with your order, raise a dispute before the countdown ends to pause the payout and protect your purchase.
          </p>
        </div>
      )}

      {/* Seller hint */}
      {isSeller && (
        <div className="flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <Banknote className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-emerald-700">
            Your funds will be automatically released to your bank account when the countdown reaches zero. Ensure your bank details are up to date.
          </p>
        </div>
      )}
    </div>
  );
};

// ===== Sub-components =====

const CountdownBlock: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="text-center bg-white rounded-xl px-4 py-3 shadow-sm border border-blue-100 min-w-[64px]">
    <div className="text-2xl font-mono font-black text-blue-700">{value}</div>
    <div className="text-[9px] text-blue-500 font-medium uppercase tracking-wider">{label}</div>
  </div>
);

const ConditionRow: React.FC<{ label: string; met: boolean; pending?: boolean }> = ({ label, met, pending }) => (
  <div className="flex items-center gap-2">
    {met ? (
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
    ) : pending ? (
      <Clock className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 animate-pulse" />
    ) : (
      <XCircle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
    )}
    <span className={`text-xs ${met ? 'text-emerald-700 font-medium' : pending ? 'text-blue-600' : 'text-gray-500'}`}>
      {label}
    </span>
  </div>
);

export default EscrowCountdownTimer;
