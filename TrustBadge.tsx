import React from 'react';
import { Shield, CheckCircle2, ExternalLink } from 'lucide-react';
import { BUYER_PROTECTION_LIMIT } from '@/types';
import { formatZAR } from '@/lib/api';

interface TrustBadgeProps {
  variant?: 'compact' | 'full' | 'inline';
  price?: number;
  showLink?: boolean;
  verified?: boolean;
  className?: string;
}

const TrustBadge: React.FC<TrustBadgeProps> = ({
  variant = 'compact',
  price,
  showLink = true,
  verified = false,
  className = '',
}) => {
  const isEligible = !price || price <= BUYER_PROTECTION_LIMIT;
  const coverageAmount = price
    ? Math.min(price, BUYER_PROTECTION_LIMIT)
    : BUYER_PROTECTION_LIMIT;

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
        <Shield className="w-3.5 h-3.5 text-emerald-600" />
        <span className="text-emerald-700 font-medium">Buyer Protected</span>
        {showLink && (
          <a
            href="/buyer-protection"
            className="text-blue-600 hover:text-blue-700 underline"
            onClick={(e) => e.stopPropagation()}
          >
            Learn more
          </a>
        )}
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl ${className}`}
      >
        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Shield className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
            Buyer Protection
            {verified && (
              <CheckCircle2 className="w-3 h-3 text-blue-600" />
            )}
          </p>
          <p className="text-[11px] text-emerald-600">
            {isEligible
              ? `Covered up to ${formatZAR(coverageAmount)}`
              : `Coverage up to ${formatZAR(BUYER_PROTECTION_LIMIT)}`}
          </p>
        </div>
        {showLink && (
          <a
            href="/buyer-protection"
            className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 rounded-lg transition-all"
            onClick={(e) => e.stopPropagation()}
            title="Learn more about Buyer Protection"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    );
  }

  // Full variant
  return (
    <div
      className={`bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 ${className}`}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Shield className="w-6 h-6 text-emerald-600" />
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-emerald-900 flex items-center gap-2">
            Buyer Protection
            {verified && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-full">
                <CheckCircle2 className="w-3 h-3" />
                Verified Seller
              </span>
            )}
          </h4>
          <p className="text-sm text-emerald-700 mt-1">
            {isEligible ? (
              <>
                This purchase is covered up to{' '}
                <strong>{formatZAR(coverageAmount)}</strong> for eligible items.
              </>
            ) : (
              <>
                Purchases are covered up to{' '}
                <strong>{formatZAR(BUYER_PROTECTION_LIMIT)}</strong> for eligible
                items.
              </>
            )}
          </p>
          <ul className="mt-3 space-y-1.5">
            <li className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              Full refund if item not received
            </li>
            <li className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              Refund if item not as described
            </li>
            <li className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              Secure PayFast payments
            </li>
          </ul>
          {showLink && (
            <a
              href="/buyer-protection"
              className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              Learn more about Buyer Protection
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrustBadge;
