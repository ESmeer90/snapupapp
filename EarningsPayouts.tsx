import React, { useState, useEffect, useCallback, Component } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getSellerEarnings, getPayouts, requestPayout, updateBankDetails, formatZAR, timeAgo } from '@/lib/api';
import type { SellerEarnings, Payout, PayoutStatus } from '@/types';
import { PAYOUT_STATUS_CONFIG, SA_BANKS } from '@/types';
import {
  DollarSign, Banknote, TrendingUp, Clock, CheckCircle2, Wallet,
  ArrowDownToLine, Loader2, RefreshCw, AlertTriangle, Building2,
  Shield, ExternalLink, Receipt, User, CreditCard, Save, Edit3
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';


// ===== ERROR BOUNDARY =====
// Catches render errors in EarningsPayouts and its children (including InlineBankForm)
// Prevents the entire app from going blank/white-screen
interface ErrorBoundaryProps {
  children: React.ReactNode;
  onRetry?: () => void;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

class EarningsErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[EarningsPayouts ErrorBoundary] Caught render error:', error);
    console.error('[EarningsPayouts ErrorBoundary] Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo: errorInfo.componentStack || '' });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: '' });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 rounded-2xl border-2 border-red-200 p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Something went wrong</h3>
          <p className="text-gray-500 text-sm mb-2 max-w-md mx-auto">
            The earnings section encountered an error. This has been logged for debugging.
          </p>
          {this.state.error && (
            <p className="text-xs text-red-500 mb-4 font-mono bg-red-100 rounded-lg p-2 max-w-md mx-auto break-words">
              {this.state.error.message}
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-200"
            >
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}


// ===== TIMEOUT WRAPPER for slow 4G connections =====
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s. Please check your connection and try again.`)), ms)
    ),
  ]);
}


// ===== MAIN COMPONENT =====
interface EarningsPayoutsProps {
  onNavigateToSettings?: () => void;
}

const EarningsPayoutsInner: React.FC<EarningsPayoutsProps> = ({ onNavigateToSettings }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [earnings, setEarnings] = useState<SellerEarnings | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [showConfirmPayout, setShowConfirmPayout] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Inline banking form state
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [bankSaving, setBankSaving] = useState(false);
  const [bankErrors, setBankErrors] = useState<Record<string, string>>({});
  const [bankFormError, setBankFormError] = useState<string | null>(null);

  const hasBankDetails = !!(profile?.bank_name && profile?.bank_account_number && profile?.bank_branch_code);

  // Debug logging
  useEffect(() => {
    console.log('[EarningsPayouts] Mount/update:', {
      userId: user?.id,
      hasProfile: !!profile,
      hasBankDetails,
      loading,
      showBankForm,
      bankName: profile?.bank_name,
      bankAccount: profile?.bank_account_number ? '****' + profile.bank_account_number.slice(-4) : 'none',
      bankBranch: profile?.bank_branch_code || 'none',
    });
  }, [user, profile, hasBankDetails, loading, showBankForm]);

  // Pre-fill bank form from profile
  useEffect(() => {
    if (profile) {
      setBankName(profile.bank_name || '');
      setAccountHolder(profile.bank_account_holder || profile.full_name || '');
      setAccountNumber(profile.bank_account_number || '');
      setBranchCode(profile.bank_branch_code || '');
    }
  }, [profile]);

  const loadData = useCallback(async () => {
    if (!user) {
      console.warn('[EarningsPayouts] loadData called without user, setting loading=false');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [earningsResult, payoutsResult] = await Promise.allSettled([
        withTimeout(getSellerEarnings(), 15000, 'Earnings fetch'),
        withTimeout(getPayouts(), 15000, 'Payouts fetch'),
      ]);

      if (earningsResult.status === 'fulfilled') {
        setEarnings(earningsResult.value);
      } else {
        console.warn('[EarningsPayouts] Earnings fetch failed, using defaults:', earningsResult.reason);
        setEarnings({
          total_revenue: 0,
          total_fees: 0,
          net_earnings: 0,
          completed_payouts: 0,
          pending_payouts: 0,
          available_balance: 0,
        });
      }

      if (payoutsResult.status === 'fulfilled') {
        setPayouts(payoutsResult.value);
      } else {
        console.warn('[EarningsPayouts] Payouts fetch failed:', payoutsResult.reason);
        setPayouts([]);
      }
    } catch (err: any) {
      console.error('[EarningsPayouts] loadData error:', err);
      setError(err.message || 'Failed to load earnings data');
      setEarnings({
        total_revenue: 0,
        total_fees: 0,
        net_earnings: 0,
        completed_payouts: 0,
        pending_payouts: 0,
        available_balance: 0,
      });
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscription on payouts table
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('payouts-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payouts',
        filter: `seller_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setPayouts(prev => [payload.new as Payout, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setPayouts(prev => prev.map(p =>
            p.id === (payload.new as any).id ? { ...p, ...(payload.new as any) } : p
          ));
          const updated = payload.new as any;
          if (updated.status === 'completed') {
            toast({ title: 'Payout Completed!', description: `${formatZAR(updated.amount)} has been sent to your bank account.` });
            loadData();
          } else if (updated.status === 'rejected') {
            toast({ title: 'Payout Rejected', description: updated.admin_notes || 'Your payout request was rejected.', variant: 'destructive' });
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, loadData]);

  const handleRequestPayout = async () => {
    if (!earnings || earnings.available_balance < 100) {
      toast({ title: 'Insufficient balance', description: 'Minimum payout amount is R100.', variant: 'destructive' });
      return;
    }
    setRequesting(true);
    try {
      await withTimeout(requestPayout(earnings.available_balance), 20000, 'Payout request');
      toast({ title: 'Payout Requested', description: `${formatZAR(earnings.available_balance)} payout has been submitted for review.` });
      setShowConfirmPayout(false);
      loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to request payout', variant: 'destructive' });
    } finally {
      setRequesting(false);
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setError(null);
    setBankFormError(null);
    loadData();
  };

  // ===== Inline Bank Details Form Logic =====
  const handleShowBankForm = () => {
    console.log('[EarningsPayouts] Opening bank form');
    setBankFormError(null);
    setBankErrors({});
    setShowBankForm(true);
  };

  const handleHideBankForm = () => {
    console.log('[EarningsPayouts] Closing bank form');
    setShowBankForm(false);
    setBankFormError(null);
    setBankErrors({});
  };

  const validateBankDetails = (): boolean => {
    const errors: Record<string, string> = {};
    if (!bankName) errors.bankName = 'Please select a bank';
    if (!accountHolder.trim()) errors.accountHolder = 'Account holder name is required';
    if (!accountNumber.trim()) {
      errors.accountNumber = 'Account number is required';
    } else if (!/^\d+$/.test(accountNumber.trim())) {
      errors.accountNumber = 'Account number must contain only digits';
    } else if (accountNumber.trim().length < 6 || accountNumber.trim().length > 20) {
      errors.accountNumber = 'Account number must be 6-20 digits';
    }
    if (!branchCode.trim()) {
      errors.branchCode = 'Branch code is required';
    } else if (!/^\d+$/.test(branchCode.trim())) {
      errors.branchCode = 'Branch code must contain only digits';
    } else if (!/^\d{5,7}$/.test(branchCode.trim())) {
      errors.branchCode = 'Branch code must be 5-7 digits';
    }
    setBankErrors(errors);
    if (Object.keys(errors).length > 0) {
      console.log('[EarningsPayouts] Validation failed:', errors);
    }
    return Object.keys(errors).length === 0;
  };

  const handleSaveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[EarningsPayouts] Save bank details clicked. Values:', {
      bankName,
      accountHolder: accountHolder ? accountHolder.charAt(0) + '***' : 'empty',
      accountNumber: accountNumber ? '****' + accountNumber.slice(-4) : 'empty',
      branchCode: branchCode || 'empty',
    });
    setBankFormError(null);
    if (!validateBankDetails()) return;
    setBankSaving(true);
    try {
      // Use 20s timeout for slow 4G connections (Johannesburg)
      await withTimeout(
        updateBankDetails({
          bank_name: bankName,
          bank_account_number: accountNumber.trim(),
          bank_branch_code: branchCode.trim(),
          bank_account_holder: accountHolder.trim(),
        }),
        20000,
        'Save bank details'
      );
      console.log('[EarningsPayouts] Bank details saved successfully');
      toast({ title: 'Bank details saved', description: 'Your banking information has been securely updated. You can now request payouts.' });

      // Refresh profile to update hasBankDetails
      if (refreshProfile) {
        try {
          await withTimeout(refreshProfile(), 10000, 'Profile refresh');
          console.log('[EarningsPayouts] Profile refreshed after bank save');
        } catch (refreshErr) {
          console.warn('[EarningsPayouts] Profile refresh failed after bank save:', refreshErr);
          // Don't throw - bank details were saved successfully
          // Force a manual re-check by reloading the page after a short delay
          toast({
            title: 'Bank details saved',
            description: 'Details saved but profile refresh was slow. The page will update shortly.',
          });
        }
      }
      setShowBankForm(false);
    } catch (err: any) {
      console.error('[EarningsPayouts] Save bank details error:', err);
      const errMsg = err.message || 'Failed to save bank details.';
      const isTimeout = errMsg.includes('timed out');
      setBankFormError(
        isTimeout
          ? 'The request timed out. Your connection may be slow. Please try again.'
          : errMsg
      );
      toast({
        title: isTimeout ? 'Connection Slow' : 'Error',
        description: isTimeout
          ? 'The save request timed out. Please check your connection and try again.'
          : errMsg,
        variant: 'destructive',
      });
    } finally {
      setBankSaving(false);
    }
  };

  // ===== RENDER: Loading State =====
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading earnings & payouts...</p>
        </div>
      </div>
    );
  }

  // ===== RENDER: Error State =====
  if (error && !earnings) {
    return (
      <div className="bg-red-50 rounded-2xl border-2 border-dashed border-red-200 p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Failed to load earnings</h3>
        <p className="text-gray-500 text-sm mb-4">{error}</p>
        <button
          onClick={handleRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all text-sm"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  // ===== RENDER: No Bank Details - Show Prompt or Inline Form =====
  if (!hasBankDetails) {
    return (
      <div className="space-y-6">
        {/* Earnings cards still show */}
        {earnings && <EarningsSummaryCards earnings={earnings} />}

        {!showBankForm ? (
          <div className="bg-amber-50 rounded-2xl border-2 border-amber-200 p-6 text-center">
            <Building2 className="w-14 h-14 text-amber-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">Bank Details Required</h3>
            <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
              To request payouts, you need to add your South African bank details. You can add them right here or in Settings.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button onClick={handleShowBankForm}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-200">
                <Building2 className="w-4 h-4" /> Add Banking Details
              </button>
              {onNavigateToSettings && (
                <button onClick={onNavigateToSettings}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-gray-600 font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-all text-sm">
                  <ExternalLink className="w-4 h-4" /> Go to Settings
                </button>
              )}
            </div>
          </div>
        ) : (
          <BankFormSection
            bankName={bankName}
            setBankName={setBankName}
            accountHolder={accountHolder}
            setAccountHolder={setAccountHolder}
            accountNumber={accountNumber}
            setAccountNumber={setAccountNumber}
            branchCode={branchCode}
            setBranchCode={setBranchCode}
            bankErrors={bankErrors}
            setBankErrors={setBankErrors}
            bankSaving={bankSaving}
            bankFormError={bankFormError}
            onSubmit={handleSaveBankDetails}
            onCancel={handleHideBankForm}
          />
        )}
      </div>
    );
  }

  // ===== RENDER: Has Bank Details - Full Earnings View =====
  const hasPendingPayout = payouts.some(p => ['pending', 'approved', 'processing'].includes(p.status));
  const canRequestPayout = earnings && earnings.available_balance >= 100 && !hasPendingPayout;

  return (
    <div className="space-y-6">
      {/* Earnings Summary Cards */}
      {earnings && <EarningsSummaryCards earnings={earnings} />}

      {/* No Earnings Yet State */}
      {earnings && earnings.total_revenue === 0 && (
        <div className="bg-blue-50 rounded-2xl border border-blue-200 p-6 text-center">
          <TrendingUp className="w-12 h-12 text-blue-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No Earnings Yet</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Once your items sell and payments are confirmed, your earnings will appear here.
            Commission rates are 5-12% based on sale price.
          </p>
        </div>
      )}

      {/* Bank Details Saved Badge */}
      <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-3 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-emerald-800">Banking Details Added</p>
          <p className="text-xs text-emerald-600 truncate">
            {profile?.bank_name || 'Bank'} ****{profile?.bank_account_number?.slice(-4) || '****'} ({profile?.bank_account_holder || profile?.full_name || 'Account Holder'})
          </p>
        </div>
        {onNavigateToSettings ? (
          <button onClick={onNavigateToSettings} className="text-xs text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-1 whitespace-nowrap px-2 py-1 rounded-lg hover:bg-emerald-100 transition-all">
            <Edit3 className="w-3 h-3" /> Edit
          </button>
        ) : (
          <a href="/settings" className="text-xs text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-1 whitespace-nowrap px-2 py-1 rounded-lg hover:bg-emerald-100 transition-all">
            <Edit3 className="w-3 h-3" /> Edit
          </a>
        )}
      </div>

      {/* Request Payout Section */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-600" />
            Request Payout
          </h3>
          <button onClick={handleRetry} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg transition-all" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl">
          <div>
            <p className="text-sm text-gray-500">Available Balance</p>
            <p className="text-3xl font-black text-emerald-600">{formatZAR(earnings?.available_balance || 0)}</p>
            {!canRequestPayout && earnings && earnings.available_balance < 100 && earnings.available_balance > 0 && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Minimum payout: R100
              </p>
            )}
            {hasPendingPayout && (
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> You have a pending payout request
              </p>
            )}
          </div>
          <div className="w-full sm:w-auto">
            {!showConfirmPayout ? (
              <button
                onClick={() => setShowConfirmPayout(true)}
                disabled={!canRequestPayout}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200 text-sm"
              >
                <ArrowDownToLine className="w-4 h-4" />
                Request Payout
              </button>
            ) : (
              <div className="bg-white rounded-xl border border-emerald-200 p-4 space-y-3 w-full sm:min-w-[280px]">
                <p className="text-sm text-gray-700">
                  Request payout of <strong className="text-emerald-700">{formatZAR(earnings?.available_balance || 0)}</strong> to:
                </p>
                <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                  <p><span className="text-gray-500">Bank:</span> <span className="font-medium">{profile?.bank_name || 'N/A'}</span></p>
                  <p><span className="text-gray-500">Account:</span> <span className="font-mono">****{profile?.bank_account_number?.slice(-4) || '****'}</span></p>
                  <p><span className="text-gray-500">Holder:</span> <span className="font-medium">{profile?.bank_account_holder || profile?.full_name || 'N/A'}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowConfirmPayout(false)}
                    className="flex-1 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                    Cancel
                  </button>
                  <button onClick={handleRequestPayout} disabled={requesting}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                    {requesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Commission Info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Receipt className="w-4 h-4 text-indigo-600" />
          Commission Structure
        </h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { range: 'Under R500', rate: '12%', color: 'bg-red-50 border-red-200 text-red-700' },
            { range: 'R500 – R2,000', rate: '10%', color: 'bg-amber-50 border-amber-200 text-amber-700' },
            { range: 'Over R2,000', rate: '5%', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          ].map((tier, i) => (
            <div key={i} className={`rounded-xl border p-2 sm:p-3 text-center ${tier.color}`}>
              <p className="text-xl sm:text-2xl font-black">{tier.rate}</p>
              <p className="text-[10px] sm:text-xs font-medium mt-1">{tier.range}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Commission is deducted from the sale price. No listing fees — you only pay when you sell.
        </p>
      </div>

      {/* Payout History */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-600" />
            Payout History
          </h3>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400">Live</span>
          </div>
        </div>

        {payouts.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            <Banknote className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            No payouts yet. Request your first payout when your balance reaches R100.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reference</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bank</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Account</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Requested</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Processed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payouts.map((payout) => {
                    const statusConf = PAYOUT_STATUS_CONFIG[payout.status as PayoutStatus] || PAYOUT_STATUS_CONFIG.pending;
                    return (
                      <tr key={payout.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-sm font-mono text-gray-900">{payout.reference || payout.id.slice(0, 8).toUpperCase()}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-bold text-emerald-600">{formatZAR(payout.amount)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${statusConf.bg} ${statusConf.color}`}>
                            {statusConf.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">{payout.bank_name || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-mono text-gray-500">{payout.account_number_masked || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500">{timeAgo(payout.created_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500">
                            {payout.processed_at ? timeAgo(payout.processed_at) : '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {payouts.map((payout) => {
                const statusConf = PAYOUT_STATUS_CONFIG[payout.status as PayoutStatus] || PAYOUT_STATUS_CONFIG.pending;
                return (
                  <div key={payout.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono text-gray-700">{payout.reference || payout.id.slice(0, 8).toUpperCase()}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${statusConf.bg} ${statusConf.color}`}>
                        {statusConf.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-emerald-600">{formatZAR(payout.amount)}</span>
                      <span className="text-xs text-gray-500">{timeAgo(payout.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Building2 className="w-3 h-3" />
                      <span>{payout.bank_name} {payout.account_number_masked}</span>
                    </div>
                    {payout.admin_notes && (
                      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5">{payout.admin_notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* POPIA Notice */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
        <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Financial data is processed securely per POPIA. Bank details are encrypted and only used for payout processing.
          Payout records are retained for tax and audit purposes as required by SARS regulations.
        </p>
      </div>
    </div>
  );
};


// ===== WRAPPER WITH ERROR BOUNDARY =====
const EarningsPayouts: React.FC<EarningsPayoutsProps> = (props) => {
  const [boundaryKey, setBoundaryKey] = useState(0);

  return (
    <EarningsErrorBoundary
      key={boundaryKey}
      onRetry={() => setBoundaryKey(prev => prev + 1)}
    >
      <EarningsPayoutsInner {...props} />
    </EarningsErrorBoundary>
  );
};


// ===== BANK FORM SECTION =====
interface BankFormSectionProps {
  bankName: string;
  setBankName: (v: string) => void;
  accountHolder: string;
  setAccountHolder: (v: string) => void;
  accountNumber: string;
  setAccountNumber: (v: string) => void;
  branchCode: string;
  setBranchCode: (v: string) => void;
  bankErrors: Record<string, string>;
  setBankErrors: (v: Record<string, string>) => void;
  bankSaving: boolean;
  bankFormError: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

const BankFormSection: React.FC<BankFormSectionProps> = (props) => {
  // Safety check: if SA_BANKS is somehow not available, provide fallback
  const banksList = Array.isArray(SA_BANKS) ? SA_BANKS : [
    'ABSA Bank', 'Capitec Bank', 'First National Bank (FNB)', 'Nedbank', 'Standard Bank', 'Other'
  ];

  return (
    <div className="bg-white rounded-2xl border-2 border-blue-200 p-4 sm:p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Building2 className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">Add Banking Details</h3>
          <p className="text-sm text-gray-500">Required for receiving payouts from your sales</p>
        </div>
      </div>

      {/* Global form error banner */}
      {props.bankFormError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-700">Failed to save bank details</p>
            <p className="text-xs text-red-600 mt-0.5 break-words">{props.bankFormError}</p>
          </div>
        </div>
      )}

      <form onSubmit={props.onSubmit} className="space-y-4" noValidate>
        {/* Bank Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Bank Name <span className="text-red-500">*</span></label>
          <div className="relative">
            <Building2 className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none" />
            <select
              value={props.bankName}
              onChange={(e) => { props.setBankName(e.target.value); props.setBankErrors({ ...props.bankErrors, bankName: '' }); }}
              className={`w-full pl-10 sm:pl-11 pr-10 py-3 bg-gray-50 border rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm appearance-none cursor-pointer ${props.bankErrors.bankName ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
            >
              <option value="">Select your bank...</option>
              {banksList.map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
            <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
          {props.bankErrors.bankName && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 flex-shrink-0" />{props.bankErrors.bankName}</p>}
        </div>

        {/* Account Holder */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Account Holder Name <span className="text-red-500">*</span></label>
          <div className="relative">
            <User className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
            <input
              type="text"
              value={props.accountHolder}
              onChange={(e) => { props.setAccountHolder(e.target.value); props.setBankErrors({ ...props.bankErrors, accountHolder: '' }); }}
              placeholder="e.g. Thabo Mokoena"
              autoComplete="name"
              className={`w-full pl-10 sm:pl-11 pr-4 py-3 bg-gray-50 border rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm ${props.bankErrors.accountHolder ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
            />
          </div>
          {props.bankErrors.accountHolder && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 flex-shrink-0" />{props.bankErrors.accountHolder}</p>}
        </div>

        {/* Account Number */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Account Number <span className="text-red-500">*</span></label>
          <div className="relative">
            <CreditCard className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={props.accountNumber}
              onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); props.setAccountNumber(val); props.setBankErrors({ ...props.bankErrors, accountNumber: '' }); }}
              placeholder="e.g. 1234567890"
              maxLength={20}
              autoComplete="off"
              className={`w-full pl-10 sm:pl-11 pr-4 py-3 bg-gray-50 border rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm font-mono ${props.bankErrors.accountNumber ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
            />
          </div>
          {props.bankErrors.accountNumber && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 flex-shrink-0" />{props.bankErrors.accountNumber}</p>}
          <p className="text-xs text-gray-400 mt-1">Your account number is encrypted and stored securely</p>
        </div>

        {/* Branch Code */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Branch Code <span className="text-red-500">*</span></label>
          <div className="relative">
            <Banknote className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={props.branchCode}
              onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); props.setBranchCode(val); props.setBankErrors({ ...props.bankErrors, branchCode: '' }); }}
              placeholder="e.g. 470010"
              maxLength={7}
              autoComplete="off"
              className={`w-full pl-10 sm:pl-11 pr-4 py-3 bg-gray-50 border rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm font-mono ${props.bankErrors.branchCode ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
            />
          </div>
          {props.bankErrors.branchCode && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 flex-shrink-0" />{props.bankErrors.branchCode}</p>}
          <p className="text-xs text-gray-400 mt-1">5-7 digit branch/universal code (e.g. Capitec: 470010)</p>
        </div>

        {/* POPIA Notice */}
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 space-y-1">
              <p><strong>POPIA Secure Storage:</strong> Your banking information is encrypted at rest and in transit. It is only used for processing payouts and is never shared with third parties.</p>
            </div>
          </div>
        </div>

        {/* Actions - stack on mobile, row on desktop */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 pt-2">
          <button type="button" onClick={props.onCancel}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all text-center">
            Cancel
          </button>
          <button type="submit" disabled={props.bankSaving}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200 text-sm">
            {props.bankSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Bank Details</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};


// Earnings Summary Cards Sub-component
const EarningsSummaryCards: React.FC<{ earnings: SellerEarnings }> = ({ earnings }) => (
  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
    <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-5">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-2 sm:mb-3 bg-emerald-100 text-emerald-600">
        <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Total Revenue</p>
      <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-0.5 sm:mt-1">{formatZAR(earnings.total_revenue)}</p>
      <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Gross sales amount</p>
    </div>

    <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-5">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-2 sm:mb-3 bg-red-100 text-red-600">
        <Receipt className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Commission Fees</p>
      <p className="text-lg sm:text-2xl font-bold text-red-600 mt-0.5 sm:mt-1">{formatZAR(earnings.total_fees)}</p>
      <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Variable 5-12% commission</p>
    </div>

    <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-5">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-2 sm:mb-3 bg-blue-100 text-blue-600">
        <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Net Earnings</p>
      <p className="text-lg sm:text-2xl font-bold text-blue-700 mt-0.5 sm:mt-1">{formatZAR(earnings.net_earnings)}</p>
      <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">After commission</p>
    </div>

    <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-5">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-2 sm:mb-3 bg-purple-100 text-purple-600">
        <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Completed Payouts</p>
      <p className="text-lg sm:text-2xl font-bold text-purple-700 mt-0.5 sm:mt-1">{formatZAR(earnings.completed_payouts)}</p>
      <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Already paid out</p>
    </div>

    <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-5">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-2 sm:mb-3 bg-amber-100 text-amber-600">
        <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Pending Payouts</p>
      <p className="text-lg sm:text-2xl font-bold text-amber-600 mt-0.5 sm:mt-1">{formatZAR(earnings.pending_payouts)}</p>
      <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Being processed</p>
    </div>

    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border-2 border-emerald-200 p-3 sm:p-5">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-2 sm:mb-3 bg-emerald-200 text-emerald-700">
        <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <p className="text-[10px] sm:text-xs font-medium text-emerald-700 uppercase tracking-wider">Available Balance</p>
      <p className="text-lg sm:text-2xl font-bold text-emerald-700 mt-0.5 sm:mt-1">{formatZAR(earnings.available_balance)}</p>
      <p className="text-[10px] sm:text-xs text-emerald-600 mt-0.5">Ready for payout</p>
    </div>
  </div>
);


export default EarningsPayouts;
