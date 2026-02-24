import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatZAR, encryptDeliveryAddress } from '@/lib/api';
import {
  calculateTotal, getPayFastConfig, createPayFastOrder, submitToPayFast,
  PAYFAST_TEST_CARDS, PAYFAST_SANDBOX_CREDENTIALS
} from '@/lib/payfast';
import { getAllShippingQuotes, getShippingTierLabel, type CourierRate } from '@/lib/shipping';
import type { Listing, SAProvince } from '@/types';
import { SA_PROVINCES } from '@/types';
import {
  X, Shield, Loader2, ArrowRight, AlertTriangle,
  CreditCard, Wallet, ExternalLink, Package, MapPin, Info, TestTube,
  Truck, Clock, ChevronDown, ChevronUp, CheckCircle2, Home, RefreshCw
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import DeliveryAddressForm, { type DeliveryAddress } from './DeliveryAddressForm';
import { supabase } from '@/lib/supabase';

interface PayFastCheckoutProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: () => void;
}

const PayFastCheckout: React.FC<PayFastCheckoutProps> = ({ listing, isOpen, onClose, onPaymentComplete }) => {
  const { user, profile } = useAuth();
  const [step, setStep] = useState<'review' | 'processing' | 'redirecting' | 'error'>('review');
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTestCards, setShowTestCards] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Shipping state
  const [buyerProvince, setBuyerProvince] = useState<SAProvince>(profile?.province || 'Gauteng');
  const [selectedCourierId, setSelectedCourierId] = useState<string>('shiplogic-economy');
  const [showAllCouriers, setShowAllCouriers] = useState(false);

  // Delivery address state
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddress>({
    street: '',
    city: '',
    postalCode: '',
    province: profile?.province || 'Gauteng',
  });
  const [popiaAddressConsent, setPopiaAddressConsent] = useState(false);

  // All hooks must be called before any conditional returns
  const listingPrice = listing ? (typeof listing.price === 'string' ? parseFloat(listing.price) || 0 : listing.price || 0) : 0;

  const payfastConfig = getPayFastConfig(profile);
  const isSandbox = payfastConfig.sandbox;
  const { amount, serviceFee, total: subtotal } = calculateTotal(listingPrice);

  const sellerProvince = ((listing?.province) || 'Gauteng') as SAProvince;
  const shippingQuotes = useMemo(
    () => getAllShippingQuotes(sellerProvince, buyerProvince),
    [sellerProvince, buyerProvince]
  );
  const selectedQuote = shippingQuotes.find(q => q.courier.id === selectedCourierId) || shippingQuotes[0];
  const shippingCost = selectedQuote?.cost || 0;
  const grandTotal = subtotal + shippingCost;

  // NOW we can safely do the early return
  if (!isOpen || !listing) return null;

  const isAddressComplete = deliveryAddress.street.trim() && deliveryAddress.city.trim() && deliveryAddress.postalCode.trim() && deliveryAddress.province;
  const canProceed = agreedToTerms && !processing && isAddressComplete && popiaAddressConsent;

  const handlePayWithPayFast = async () => {
    if (!user || !agreedToTerms) return;

    // Validate delivery address
    if (!isAddressComplete) {
      toast({ title: 'Delivery Address Required', description: 'Please fill in your complete delivery address before proceeding.', variant: 'destructive' });
      return;
    }
    if (!popiaAddressConsent) {
      toast({ title: 'Consent Required', description: 'Please accept the POPIA address consent to proceed.', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    setStep('processing');
    setErrorMsg('');
    setErrorDetail('');

    try {
      console.log('[PayFastCheckout] Creating order for listing:', listing.id);
      const result = await createPayFastOrder(listing.id, isSandbox);
      console.log('[PayFastCheckout] Order created:', result.order?.id);

      // Save encrypted delivery address
      if (result.order?.id) {
        try {
          await encryptDeliveryAddress(result.order.id, {
            street: deliveryAddress.street,
            city: deliveryAddress.city,
            postalCode: deliveryAddress.postalCode,
            province: deliveryAddress.province,
          });
          console.log('[PayFastCheckout] Delivery address encrypted and saved');
        } catch (addrErr: any) {
          console.warn('[PayFastCheckout] Address encryption failed (non-blocking):', addrErr.message);
        }
      }

      setStep('redirecting');
      await new Promise((r) => setTimeout(r, 800));

      console.log('[PayFastCheckout] Submitting to PayFast:', result.payfast_url);
      submitToPayFast(result.payfast_form_fields, result.payfast_url);
    } catch (err: any) {
      console.error('[PayFastCheckout] Checkout error:', err);
      const msg = err.message || 'Failed to initiate payment. Please try again.';
      
      // Determine if this is a session error
      const isSessionError = msg.toLowerCase().includes('session') || msg.toLowerCase().includes('sign in') || msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('unauthorized');
      
      setErrorMsg(isSessionError 
        ? 'Your login session has expired.' 
        : msg
      );
      setErrorDetail(isSessionError 
        ? 'Please sign out and sign back in, then try your purchase again.'
        : 'If this keeps happening, try refreshing the page or signing out and back in.'
      );
      setStep('error');
      setProcessing(false);
      
      // Only show toast once (not in the modal AND as a toast)
      // The error is shown in the modal UI, so skip the toast
    }
  };

  const handleRetry = async () => {
    setRetryCount(prev => prev + 1);
    
    // If retrying, try to refresh the session first
    try {
      console.log('[PayFastCheckout] Refreshing session before retry...');
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('[PayFastCheckout] Session refresh failed:', refreshError.message);
      } else {
        console.log('[PayFastCheckout] Session refreshed for retry');
      }
    } catch (e) {
      console.warn('[PayFastCheckout] Refresh attempt failed:', e);
    }
    
    setStep('review');
    setErrorMsg('');
    setErrorDetail('');
    setProcessing(false);
    
    // Auto-trigger payment after a short delay if this is a retry
    if (canProceed) {
      setTimeout(() => {
        handlePayWithPayFast();
      }, 500);
    }
  };

  const handleClose = () => {
    if (step === 'processing' || step === 'redirecting') return;
    setStep('review');
    setErrorMsg('');
    setErrorDetail('');
    setAgreedToTerms(false);
    setProcessing(false);
    setShowTestCards(false);
    setShowAllCouriers(false);
    setRetryCount(0);
    onClose();
  };

  const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=200&fit=crop';

  const CourierLogo: React.FC<{ logo: string; selected?: boolean }> = ({ logo, selected }) => (
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black ${
      selected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {logo}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={`px-6 py-5 text-white flex items-center justify-between sticky top-0 z-10 ${
          isSandbox
            ? 'bg-gradient-to-r from-amber-500 to-amber-600'
            : 'bg-gradient-to-r from-blue-600 to-blue-700'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              {isSandbox ? <TestTube className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold">PayFast Checkout</h2>
              <p className={`text-xs flex items-center gap-1 ${isSandbox ? 'text-amber-100' : 'text-blue-100'}`}>
                <Shield className="w-3 h-3" />
                {isSandbox ? 'Sandbox Mode — No real charges' : 'Secure live payment via PayFast'}
              </p>
            </div>
          </div>
          {step !== 'processing' && step !== 'redirecting' && (
            <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-all">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Step: Review Order */}
        {step === 'review' && (
          <div className="p-6 space-y-5">
            {/* Retry success notice */}
            {retryCount > 0 && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <RefreshCw className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <p className="text-xs text-blue-700">Session refreshed. Please try your payment again.</p>
              </div>
            )}

            {/* Item Summary */}
            <div className="flex gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0">
                <img
                  src={listing.images?.[0] || PLACEHOLDER_IMAGE}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE; }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm truncate">{listing.title}</h3>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <MapPin className="w-3 h-3" />
                  <span>{listing.location}, {listing.province}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <Package className="w-3 h-3" />
                  <span>Sold by {listing.seller_name || 'Seller'}</span>
                </div>
                <p className="text-lg font-bold text-blue-600 mt-2">{formatZAR(listingPrice)}</p>
              </div>
            </div>

            {/* Shipping Calculator */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-600" /> Shipping Estimate
              </h4>

              {/* Buyer Province Selector */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Deliver to</label>
                <select
                  value={buyerProvince}
                  onChange={(e) => setBuyerProvince(e.target.value as SAProvince)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {SA_PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Route Info */}
              {selectedQuote && (
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  <MapPin className="w-3 h-3 text-indigo-500" />
                  <span>{sellerProvince}</span>
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                  <span>{buyerProvince}</span>
                  <span className="ml-auto px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-semibold">
                    {getShippingTierLabel(selectedQuote.tier)}
                  </span>
                </div>
              )}

              {/* Selected Courier */}
              {selectedQuote && (
                <div
                  className="flex items-center gap-3 p-3 bg-blue-50 border-2 border-blue-200 rounded-xl cursor-pointer hover:bg-blue-100 transition-all"
                  onClick={() => setShowAllCouriers(!showAllCouriers)}
                >
                  <CourierLogo logo={selectedQuote.courier.logo} selected />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-blue-800">{selectedQuote.courier.name}</span>
                      <span className="text-sm font-bold text-blue-700">{formatZAR(selectedQuote.cost)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3 text-blue-500" />
                      <span className="text-xs text-blue-600">{selectedQuote.estimatedDays}</span>
                    </div>
                  </div>
                  {showAllCouriers ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-blue-500" />}
                </div>
              )}

              {/* All Courier Options */}
              {showAllCouriers && (
                <div className="space-y-2">
                  {shippingQuotes.map((quote) => {
                    const isSelected = quote.courier.id === selectedCourierId;
                    return (
                      <button
                        key={quote.courier.id}
                        onClick={() => {
                          setSelectedCourierId(quote.courier.id);
                          setShowAllCouriers(false);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <CourierLogo logo={quote.courier.logo} selected={isSelected} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-semibold ${isSelected ? 'text-blue-800' : 'text-gray-700'}`}>
                              {quote.courier.name}
                            </span>
                            <span className={`text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                              {formatZAR(quote.cost)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />{quote.estimatedDays}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{quote.courier.description}</p>
                        </div>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Delivery Address */}
            <DeliveryAddressForm
              address={deliveryAddress}
              onChange={(addr) => {
                setDeliveryAddress(addr);
                if (addr.province !== buyerProvince) {
                  setBuyerProvince(addr.province);
                }
              }}
              popiaConsent={popiaAddressConsent}
              onConsentChange={setPopiaAddressConsent}
              buyerProvince={buyerProvince}
            />

            {/* Address validation warning */}
            {!isAddressComplete && (
              <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-orange-700">
                  Please fill in your complete delivery address above to proceed with payment.
                </p>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Order Summary</h4>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Item price</span>
                <span className="font-medium text-gray-900">{formatZAR(amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1">
                  Service fee (2.5%)
                  <span className="group relative">
                    <Info className="w-3 h-3 text-gray-400 cursor-help" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                      This fee covers payment processing, buyer protection, and platform maintenance.
                    </span>
                  </span>
                </span>
                <span className="font-medium text-gray-900">{formatZAR(serviceFee)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1">
                  <Truck className="w-3 h-3 text-indigo-500" />
                  Shipping ({selectedQuote?.courier.name})
                </span>
                <span className="font-medium text-indigo-600">{formatZAR(shippingCost)}</span>
              </div>
              {selectedQuote && (
                <div className="flex justify-between text-[11px] text-gray-400 pl-4">
                  <span>{getShippingTierLabel(selectedQuote.tier)} · {selectedQuote.estimatedDays}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-black text-blue-600 text-lg">{formatZAR(grandTotal)}</span>
              </div>
            </div>

            {/* PayFast Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ExternalLink className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-800">PayFast Secure Payment</p>
                  <p className="text-xs text-blue-600 mt-1">
                    You will be redirected to PayFast's secure payment page to complete your purchase. 
                    PayFast supports credit/debit cards, EFT, SnapScan, and Mobicred.
                  </p>
                </div>
              </div>
            </div>

            {/* Sandbox Notice with Test Cards */}
            {isSandbox && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                <div className="p-3">
                  <div className="flex items-start gap-2">
                    <TestTube className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-amber-800">Sandbox Mode (Testing)</p>
                        <button
                          onClick={() => setShowTestCards(!showTestCards)}
                          className="text-[10px] font-medium text-amber-600 hover:text-amber-700 underline"
                        >
                          {showTestCards ? 'Hide' : 'Show'} test cards
                        </button>
                      </div>
                      <p className="text-xs text-amber-700 mt-0.5">
                        No real money will be charged. Using merchant ID: <span className="font-mono font-bold">{PAYFAST_SANDBOX_CREDENTIALS.merchant_id}</span>
                      </p>
                    </div>
                  </div>
                </div>
                {showTestCards && (
                  <div className="border-t border-amber-200 bg-amber-100/50 p-3 space-y-1.5">
                    <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider">Test Card Numbers</p>
                    {PAYFAST_TEST_CARDS.map((card) => (
                      <div key={card.number} className="flex items-center justify-between text-xs">
                        <span className="text-amber-700">{card.type}</span>
                        <span className="font-mono font-bold text-amber-900">{card.number}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-amber-600 mt-1">CVV: 123 | Expiry: Any future date</p>
                  </div>
                )}
              </div>
            )}

            {/* Live Mode Notice */}
            {!isSandbox && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-800">Live Mode</p>
                    <p className="text-xs text-red-700 mt-0.5">
                      Real money will be charged. If PayFast live credentials are not configured, the system will fall back to sandbox mode automatically.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Terms Agreement */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-500 leading-relaxed">
                I agree to SnapUp's <span className="text-blue-600 font-medium">Terms of Service</span> and{' '}
                <a href="/buyer-protection" className="text-blue-600 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>Buyer Protection Policy</a>. 
                I understand that my payment data is processed securely by PayFast in compliance with POPIA.
              </span>
            </label>

            {/* Pay Button */}
            <button
              onClick={handlePayWithPayFast}
              disabled={!canProceed}
              className={`w-full py-4 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 text-base disabled:from-gray-300 disabled:to-gray-400 disabled:shadow-none disabled:cursor-not-allowed ${
                isSandbox
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-amber-200'
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-200'
              }`}
            >
              <CreditCard className="w-5 h-5" />
              {isSandbox ? `Test Pay ${formatZAR(grandTotal)}` : `Pay ${formatZAR(grandTotal)} with PayFast`}
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Helpful hint if button is disabled */}
            {!canProceed && agreedToTerms && (
              <p className="text-xs text-center text-orange-600">
                {!isAddressComplete ? 'Complete your delivery address to continue' : !popiaAddressConsent ? 'Accept the POPIA address consent to continue' : ''}
              </p>
            )}

            {/* Security Footer */}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 pt-1">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>256-bit SSL encryption | POPIA compliant | Buyer protection included</span>
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div className="p-10 text-center">
            <div className="relative w-16 h-16 mx-auto mb-5">
              <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Creating Your Order</h3>
            <p className="text-sm text-gray-500 mt-2">Setting up your secure payment...</p>
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400 justify-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span>Verifying listing availability</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 justify-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                <span>Calculating shipping ({selectedQuote?.courier.name})</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 justify-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.6s' }} />
                <span>Generating payment signature ({isSandbox ? 'sandbox' : 'live'})</span>
              </div>
            </div>
            {isSandbox && (
              <div className="mt-4 px-4 py-2 bg-amber-50 rounded-lg inline-flex items-center gap-2">
                <TestTube className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs text-amber-700 font-medium">Sandbox mode — no real charges</span>
              </div>
            )}
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
              <Shield className="w-3.5 h-3.5" />
              <span>Your data is encrypted and secure</span>
            </div>
          </div>
        )}

        {/* Step: Redirecting to PayFast */}
        {step === 'redirecting' && (
          <div className="p-10 text-center">
            <div className="relative w-16 h-16 mx-auto mb-5">
              <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-25" />
              <div className="relative w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <ExternalLink className="w-7 h-7 text-blue-600" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              Redirecting to PayFast {isSandbox ? 'Sandbox' : ''}
            </h3>
            <p className="text-sm text-gray-500 mt-2">
              You're being redirected to PayFast's {isSandbox ? 'test' : 'secure'} payment page...
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="text-sm text-blue-600 font-medium">Please wait</span>
            </div>
            <p className="text-xs text-gray-400 mt-6">
              If you're not redirected within 10 seconds,{' '}
              <button onClick={handlePayWithPayFast} className="text-blue-600 underline">click here to retry</button>
            </p>
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Payment Failed</h3>
            <p className="text-sm text-gray-600 mt-2 font-medium">{errorMsg}</p>
            {errorDetail && (
              <p className="text-xs text-gray-500 mt-1">{errorDetail}</p>
            )}
            
            {/* Specific help for common errors */}
            {errorMsg.toLowerCase().includes('session') && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left">
                <p className="text-xs text-amber-800 font-semibold mb-1">Quick Fix:</p>
                <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
                  <li>Click "Try Again" below (we'll refresh your session automatically)</li>
                  <li>If that doesn't work, sign out and sign back in</li>
                  <li>Then return to this listing and try again</li>
                </ol>
              </div>
            )}
            
            {!isSandbox && !errorMsg.toLowerCase().includes('session') && (
              <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded-lg px-3 py-2 inline-block">
                If live credentials aren't configured, try switching to Sandbox mode in Settings.
              </p>
            )}
            
            <div className="flex gap-3 mt-6 justify-center">
              <button
                onClick={handleRetry}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={handleClose}
                className="px-6 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
            </div>
            
            {retryCount > 0 && (
              <p className="text-[10px] text-gray-400 mt-3">
                Attempt {retryCount + 1} · If issues persist, please contact support
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PayFastCheckout;
