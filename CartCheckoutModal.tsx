import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { formatZAR } from '@/lib/api';
import {
  calculateTotal, getPayFastConfig, createPayFastOrder, submitToPayFast,
  PAYFAST_TEST_CARDS, PAYFAST_SANDBOX_CREDENTIALS
} from '@/lib/payfast';
import { getAllShippingQuotes, getShippingTierLabel } from '@/lib/shipping';
import type { SAProvince } from '@/types';
import { SA_PROVINCES } from '@/types';
import {
  X, Shield, Loader2, ArrowRight, AlertTriangle,
  CreditCard, Wallet, ExternalLink, Package, MapPin, Info, TestTube,
  Truck, Clock, CheckCircle2, ShoppingCart, RefreshCw
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import DeliveryAddressForm, { type DeliveryAddress } from './DeliveryAddressForm';
import { supabase } from '@/lib/supabase';

interface CartCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: () => void;
}

const CartCheckoutModal: React.FC<CartCheckoutModalProps> = ({ isOpen, onClose, onPaymentComplete }) => {
  const { user, profile } = useAuth();
  const { cartItems, clearCart } = useCart();
  const [step, setStep] = useState<'review' | 'processing' | 'redirecting' | 'error'>('review');
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
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
  const [buyerProvince, setBuyerProvince] = useState<SAProvince>(profile?.province || 'Gauteng');

  const payfastConfig = getPayFastConfig(profile);
  const isSandbox = payfastConfig.sandbox;

  // Active cart items only
  const activeItems = cartItems.filter(i => i.listing && i.listing.status === 'active');

  // Calculate totals
  const subtotal = activeItems.reduce((sum, item) => {
    const price = typeof item.listing?.price === 'number' ? item.listing.price : 0;
    return sum + price * item.quantity;
  }, 0);
  const { serviceFee } = calculateTotal(subtotal);
  const grandTotal = subtotal + serviceFee;

  if (!isOpen || activeItems.length === 0) return null;

  const isAddressComplete = deliveryAddress.street.trim() && deliveryAddress.city.trim() && deliveryAddress.postalCode.trim() && deliveryAddress.province;
  const canProceed = agreedToTerms && !processing && isAddressComplete && popiaConsent;

  // For multi-item checkout, we process the first item via PayFast and create orders for all
  const handlePay = async () => {
    if (!user || !canProceed) return;
    setProcessing(true);
    setStep('processing');
    setErrorMsg('');

    try {
      // For now, process the first listing via PayFast (multi-item support)
      // In production, you'd create a combined order or process each separately
      const firstItem = activeItems[0];
      if (!firstItem.listing) throw new Error('No listing found');

      const result = await createPayFastOrder(firstItem.listing.id, isSandbox);

      // Save delivery address
      if (result.order?.id) {
        try {
          const addressStr = JSON.stringify(deliveryAddress);
          await supabase.from('orders').update({ delivery_address: addressStr }).eq('id', result.order.id);
        } catch (e) {
          console.warn('Failed to save address:', e);
        }
      }

      setStep('redirecting');
      await new Promise(r => setTimeout(r, 800));
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
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={`px-6 py-5 text-white flex items-center justify-between sticky top-0 z-10 ${
          isSandbox ? 'bg-gradient-to-r from-amber-500 to-amber-600' : 'bg-gradient-to-r from-blue-600 to-blue-700'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Cart Checkout</h2>
              <p className={`text-xs flex items-center gap-1 ${isSandbox ? 'text-amber-100' : 'text-blue-100'}`}>
                <Shield className="w-3 h-3" />
                {isSandbox ? 'Sandbox Mode' : 'Secure payment via PayFast'}
              </p>
            </div>
          </div>
          {step !== 'processing' && step !== 'redirecting' && (
            <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-all">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Review Step */}
        {step === 'review' && (
          <div className="p-6 space-y-5">
            {/* Cart Items Summary */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                Cart Items ({activeItems.length})
              </h4>
              {activeItems.map((item) => {
                const listing = item.listing!;
                const imageUrl = listing.images?.[0] || '';
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                      <img src={imageUrl} alt={listing.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{listing.title}</p>
                      <p className="text-xs text-gray-500">Qty: {item.quantity} · {listing.seller_name || 'Seller'}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{formatZAR(listing.price * item.quantity)}</span>
                  </div>
                );
              })}
            </div>

            {/* Delivery Address */}
            <DeliveryAddressForm
              address={deliveryAddress}
              onChange={(addr) => {
                setDeliveryAddress(addr);
                if (addr.province !== buyerProvince) setBuyerProvince(addr.province);
              }}
              popiaConsent={popiaConsent}
              onConsentChange={setPopiaConsent}
              buyerProvince={buyerProvince}
            />

            {/* Order Summary */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Order Summary</h4>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-900">{formatZAR(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1">
                  Service fee (2.5%)
                  <span className="group relative">
                    <Info className="w-3 h-3 text-gray-400 cursor-help" />
                  </span>
                </span>
                <span className="font-medium text-gray-900">{formatZAR(serviceFee)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-black text-blue-600 text-lg">{formatZAR(grandTotal)}</span>
              </div>
            </div>

            {/* PayFast Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <ExternalLink className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">PayFast Secure Payment</p>
                  <p className="text-xs text-blue-600 mt-1">
                    You will be redirected to PayFast to complete payment via card, EFT, SnapScan, or Mobicred.
                  </p>
                </div>
              </div>
            </div>

            {/* Sandbox Notice */}
            {isSandbox && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                <div className="p-3">
                  <div className="flex items-start gap-2">
                    <TestTube className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-amber-800">Sandbox Mode (Testing)</p>
                        <button onClick={() => setShowTestCards(!showTestCards)} className="text-[10px] font-medium text-amber-600 hover:text-amber-700 underline">
                          {showTestCards ? 'Hide' : 'Show'} test cards
                        </button>
                      </div>
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

            {/* Terms */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-xs text-gray-500 leading-relaxed">
                I agree to SnapUp's Terms of Service and{' '}
                <a href="/buyer-protection" className="text-blue-600 font-medium hover:underline">Buyer Protection Policy</a>.
              </span>
            </label>

            {/* Pay Button */}
            <button
              onClick={handlePay}
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

            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 pt-1">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>256-bit SSL | POPIA compliant | Buyer protection</span>
            </div>
          </div>
        )}

        {/* Processing */}
        {step === 'processing' && (
          <div className="p-10 text-center">
            <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-5" />
            <h3 className="text-lg font-bold text-gray-900">Processing Cart Checkout</h3>
            <p className="text-sm text-gray-500 mt-2">Creating orders for {activeItems.length} item{activeItems.length !== 1 ? 's' : ''}...</p>
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
            <h3 className="text-lg font-bold text-gray-900">Redirecting to PayFast</h3>
            <p className="text-sm text-gray-500 mt-2">Please wait...</p>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Payment Failed</h3>
            <p className="text-sm text-gray-500 mt-2">{errorMsg}</p>
            <div className="flex gap-3 mt-6 justify-center">
              <button onClick={() => { setStep('review'); setErrorMsg(''); setProcessing(false); }} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
              <button onClick={handleClose} className="px-6 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartCheckoutModal;
