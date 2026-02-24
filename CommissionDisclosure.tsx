import React, { useState } from 'react';
import { calculateCommission, COMMISSION_TIERS, formatCommissionRate } from '@/lib/commission';
import { formatZAR } from '@/lib/api';
import { Info, ChevronDown, ChevronUp, Shield, AlertTriangle, Gift } from 'lucide-react';
import PromoBanner from './PromoBanner';

interface CommissionDisclosureProps {
  price: number;
  agreed: boolean;
  onAgreeChange: (agreed: boolean) => void;
}

const CommissionDisclosure: React.FC<CommissionDisclosureProps> = ({ price, agreed, onAgreeChange }) => {
  const [showDetails, setShowDetails] = useState(false);
  const breakdown = price > 0 ? calculateCommission(price) : null;

  return (
    <div className="space-y-3">
      {/* Promo Banner - inline variant */}
      <PromoBanner variant="inline" />

      {/* Commission Estimate Preview */}
      {breakdown && price > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-blue-600" />
              Seller Net Estimate
            </h4>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              breakdown.tier === 'premium' ? 'bg-emerald-100 text-emerald-700' :
              breakdown.tier === 'mid' ? 'bg-blue-100 text-blue-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {formatCommissionRate(breakdown.commissionRate)} commission
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-500">Sale Price</p>
              <p className="text-sm font-bold text-gray-900">{formatZAR(breakdown.salePrice)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Commission</p>
              <p className="text-sm font-bold text-red-600">-{formatZAR(breakdown.commissionAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">You Receive</p>
              <p className="text-sm font-bold text-emerald-600">{formatZAR(breakdown.netSellerAmount)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Commission Tiers Dropdown */}
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center justify-between w-full text-left px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-all"
      >
        <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-blue-500" />
          View commission rate tiers
        </span>
        {showDetails ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>

      {showDetails && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Price Range</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500 uppercase tracking-wider">Rate</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wider">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {COMMISSION_TIERS.map((tier, i) => {
                const isActive = breakdown && breakdown.commissionRate === tier.rate;
                return (
                  <tr key={i} className={isActive ? 'bg-blue-50' : ''}>
                    <td className="px-3 py-2.5 text-gray-700 font-medium">{tier.label}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full font-semibold ${
                        isActive ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {tier.rateLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500">
                      {tier.min === 0 ? `R200 → R${200 - 200 * tier.rate} net` :
                       tier.max === Infinity ? `R5,000 → R${5000 - 5000 * tier.rate} net` :
                       `R1,000 → R${1000 - 1000 * tier.rate} net`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 bg-emerald-50 text-[10px] text-emerald-700 flex items-center gap-1.5">
            <Gift className="w-3 h-3 flex-shrink-0" />
            Launch Promo: 0% commission on your first 10 sales! Standard rates apply after.
          </div>
          <div className="px-3 py-2 bg-gray-50 text-[10px] text-gray-400">
            No listing fees. Commission is only charged on successful sales.
          </div>
        </div>
      )}

      {/* Mandatory Agreement Checkbox */}
      <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
        agreed ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => onAgreeChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
        />
        <div className="text-xs text-gray-700 leading-relaxed">
          <span className="font-semibold">I acknowledge</span> that a <strong>5–12% commission</strong> (based on sale price) will be deducted from my payout upon successful sale.
          <span className="block mt-1 text-emerald-700 font-medium">Launch Promo: 0% on your first 10 sales!</span>
          <span className="block mt-1 text-gray-400">No listing fees — commission only when an item sells. This acknowledgment is required to publish your listing.</span>
        </div>
      </label>

      {!agreed && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertTriangle className="w-3 h-3" />
          <span>Please agree to the commission terms to publish your listing</span>
        </div>
      )}
    </div>
  );
};

export default CommissionDisclosure;
