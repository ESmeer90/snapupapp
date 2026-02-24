import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatZAR, saveDeliveryAddress, updateOrderCourierService } from '@/lib/api';
import {
  calculateTotal, getPayFastConfig, createPayFastOrder, submitToPayFast,
  PAYFAST_TEST_CARDS, PAYFAST_SANDBOX_CREDENTIALS
} from '@/lib/payfast';
import type { Listing } from '@/types';
import { BUYER_PROTECTION_LIMIT } from '@/types';
import TrustBadge from './TrustBadge';
import DeliveryAddressForm, { type DeliveryAddress } from './DeliveryAddressForm';
import ShippingRateCalculator, { type SelectedShippingOption } from './ShippingRateCalculator';
import {
  X, CreditCard, Wallet, CheckCircle2, Loader2, ArrowRight, Shield,
  AlertTriangle, ExternalLink, Info, TestTube, Truck
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface CheckoutModalProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: () => void;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({ listing, isOpen, onClose, onPaymentComplete }) => {
  const { user, profile } = useAuth();
  const [step, setStep] = useState<'review' | 'processing' | 'redirecting' | 'error'>('review');
  const [errorMsg, setErrorMsg] = useState('');
  const [processing, setProcessing] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTestCards, setShowTestCards] = useState(false);

  // Delivery address state
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddress>({
    street: '',
    city: '',
    postalCode: '',
    province: (profile?.province || 'Gauteng') as DeliveryAddress['province'],
  });
  const [popiaConsent, setPopiaConsent] = useState(false);

  // Shipping option state
  const [selectedShipping, setSelectedShipping] = useState<SelectedShippingOption | null>(null);

  if (!isOpen || !listing) return null;

  // Dynamic sandbox/live mode from user profile
  const payfastConfig = getPayFastConfig(profile);
  const isSandbox = payfastConfig.sandbox;

  const { amount, serviceFee, total } = calculateTotal(listing.price);
  const shippingCost = selectedShipping?.rate || 0;
  const grandTotal = total + shippingCost;

  const isAddressComplete = deliveryAddress.street.trim() && deliveryAddress.city.trim() && deliveryAddress.postalCode.trim() && deliveryAddress.province;
  const canPay = agreedToTerms && popiaConsent && isAddressComplete && selectedShipping;

  const handlePay = async () => {
    if (!user || !canPay) return;
    setProcessing(true);
    setStep('processing');
    setErrorMsg('');

    try {
      // Server-side: create order + generate PayFast signature
      const result = await createPayFastOrder(listing.id, isSandbox);

      // After order creation, save delivery address and courier service
      const orderId = result.order?.id;
      if (orderId) {
        // Save delivery address (fire and forget - don't block payment)
        const addressStr = JSON.stringify(deliveryAddress);
        saveDeliveryAddress(orderId, addressStr).catch(err => {
          console.warn('[Checkout] Failed to save delivery address:', err);
        });

        // Save selected courier service
        if (selectedShipping) {
          updateOrderCourierService(orderId, selectedShipping.service).catch(err => {
            console.warn('[Checkout] Failed to save courier service:', err);
          });
        }
      }

      setStep('redirecting');
      await new Promise((r) => setTimeout(r, 800));
      // Redirect to PayFast
      submitToPayFast(result.payfast_form_fields, result.payfast_url);
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment failed. Please try again.');
      setStep('error');
      setProcessing(false);
    }
  };

  const handleClose = () => {
    if (step === 'processing' || step === 'redirecting') return;
    setStep('review');
    setErrorMsg('');
    setAgreedToTerms(false);
    setProcessing(false);
    setShowTestCards(false);
    setSelectedShipping(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={`px-6 py-5 text-white flex items-center justify-between ${
          isSandbox
            ? 'bg-gradient-to-r from-amber-500 to-amber-600'
            : 'bg-gradient-to-r from-blue-600 to-blue-700'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              {isSandbox ? <TestTube className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold">Checkout</h2>
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

        {/* Review */}
        {step === 'review' && (
          <div className="p-6 space-y-4">
            {/* Order Summary */}
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
                      Covers payment processing, buyer protection, and platform maintenance.
                    </span>
                  </span>
                </span>
                <span className="font-medium text-gray-900">{formatZAR(serviceFee)}</span>
              </div>
              {selectedShipping && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Truck className="w-3 h-3" />
                    Shipping ({selectedShipping.service.replace('ShipLogic ', '')})
                  </span>
                  <span className="font-medium text-gray-900">{formatZAR(shippingCost)}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-black text-blue-600 text-lg">{formatZAR(grandTotal)}</span>
              </div>
            </div>

            {/* Buyer Protection Badge */}
            <TrustBadge
              variant="compact"
              price={listing.price}
              showLink={true}
            />

            {/* Delivery Address Form */}
            <DeliveryAddressForm
              address={deliveryAddress}
              onChange={setDeliveryAddress}
              popiaConsent={popiaConsent}
              onConsentChange={setPopiaConsent}
              buyerProvince={(profile?.province || 'Gauteng') as DeliveryAddress['province']}
              collapsed={false}
            />

            {/* Shipping Rate Calculator */}
            <ShippingRateCalculator
              sellerProvince={listing.province}
              buyerAddress={deliveryAddress}
              onSelect={setSelectedShipping}
              selectedOption={selectedShipping}
            />

            {/* Validation Messages */}
            {isAddressComplete && !selectedShipping && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Truck className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Please select a shipping option above to continue with checkout.
                </p>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <ExternalLink className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">PayFast Secure Payment</p>
                  <p className="text-xs text-blue-600 mt-1">You'll be redirected to PayFast to complete payment via card, EFT, SnapScan, or Mobicred.</p>
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
                        No real charges. Merchant: <span className="font-mono font-bold">{PAYFAST_SANDBOX_CREDENTIALS.merchant_id}</span>
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
                  <p className="text-xs text-red-700">
                    <span className="font-semibold">Live Mode</span> — Real money will be charged. Falls back to sandbox if live credentials aren't configured.
                  </p>
                </div>
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-xs text-gray-500 leading-relaxed">
                I agree to SnapUp's Terms of Service and{' '}
                <a href="/buyer-protection" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                  Buyer Protection Policy
                </a>
                . Payment processed securely by PayFast (POPIA compliant).
              </span>
            </label>

            <button onClick={handlePay} disabled={!canPay || processing} className={`w-full py-4 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 text-base disabled:from-gray-300 disabled:to-gray-400 disabled:shadow-none disabled:cursor-not-allowed ${
              isSandbox
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-amber-200'
                : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-200'
            }`}>
              <CreditCard className="w-5 h-5" />
              {isSandbox ? `Test Pay ${formatZAR(grandTotal)}` : `Pay ${formatZAR(grandTotal)} with PayFast`}
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Incomplete requirements hint */}
            {!canPay && agreedToTerms && (
              <div className="text-center">
                <p className="text-xs text-gray-400">
                  {!isAddressComplete && 'Complete your delivery address'}
                  {isAddressComplete && !popiaConsent && 'Accept POPIA address consent'}
                  {isAddressComplete && popiaConsent && !selectedShipping && 'Select a shipping option'}
                </p>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 pt-1">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>256-bit SSL | POPIA compliant | <a href="/buyer-protection" className="text-blue-500 hover:underline">Buyer protection</a></span>
            </div>
          </div>
        )}

        {/* Processing */}
        {step === 'processing' && (
          <div className="p-10 text-center">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900">Creating Your Order</h3>
            <p className="text-sm text-gray-500 mt-2">Verifying availability and generating secure payment...</p>
            {selectedShipping && (
              <div className="mt-3 px-3 py-1.5 bg-blue-50 rounded-lg inline-flex items-center gap-1.5">
                <Truck className="w-3 h-3 text-blue-600" />
                <span className="text-xs text-blue-700 font-medium">{selectedShipping.service} — {formatZAR(selectedShipping.rate)}</span>
              </div>
            )}
            {isSandbox && (
              <div className="mt-2 px-3 py-1.5 bg-amber-50 rounded-lg inline-flex items-center gap-1.5">
                <TestTube className="w-3 h-3 text-amber-600" />
                <span className="text-xs text-amber-700 font-medium">Sandbox — no real charges</span>
              </div>
            )}
          </div>
        )}

        {/* Redirecting */}
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
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Payment Error</h3>
            <p className="text-sm text-gray-500 mt-2">{errorMsg}</p>
            {!isSandbox && (
              <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded-lg px-3 py-2 inline-block">
                Tip: If live credentials aren't configured, switch to Sandbox mode in Settings.
              </p>
            )}
            <div className="flex gap-3 mt-6 justify-center">
              <button onClick={() => { setStep('review'); setErrorMsg(''); setProcessing(false); }} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all">Try Again</button>
              <button onClick={() => { setStep('review'); setErrorMsg(''); setProcessing(false); onClose(); }} className="px-6 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckoutModal;
