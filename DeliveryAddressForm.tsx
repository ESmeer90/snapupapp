import React, { useState } from 'react';
import { SA_PROVINCES, type SAProvince } from '@/types';
import { MapPin, Shield, Home, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';

export interface DeliveryAddress {
  street: string;
  city: string;
  postalCode: string;
  province: SAProvince;
}

interface DeliveryAddressFormProps {
  address: DeliveryAddress;
  onChange: (address: DeliveryAddress) => void;
  popiaConsent: boolean;
  onConsentChange: (consent: boolean) => void;
  buyerProvince: SAProvince;
  collapsed?: boolean;
}

const DeliveryAddressForm: React.FC<DeliveryAddressFormProps> = ({
  address, onChange, popiaConsent, onConsentChange, buyerProvince, collapsed = false
}) => {
  const [expanded, setExpanded] = useState(!collapsed);

  const updateField = (field: keyof DeliveryAddress, value: string) => {
    onChange({ ...address, [field]: value });
  };

  const isComplete = address.street.trim() && address.city.trim() && address.postalCode.trim() && address.province;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isComplete && popiaConsent ? 'bg-emerald-100' : 'bg-orange-100'}`}>
            {isComplete && popiaConsent ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <Home className="w-4 h-4 text-orange-600" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-700">Delivery Address</h4>
            {isComplete ? (
              <p className="text-xs text-gray-500 truncate max-w-[250px]">
                {address.street}, {address.city}, {address.postalCode}
              </p>
            ) : (
              <p className="text-xs text-orange-600">Required for shipping</p>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {/* Street Address */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Street Address <span className="text-red-500">*</span></label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={address.street}
                onChange={(e) => updateField('street', e.target.value)}
                placeholder="e.g. 123 Main Road, Apartment 4B"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* City + Postal Code */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">City / Town <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={address.city}
                onChange={(e) => updateField('city', e.target.value)}
                placeholder="e.g. Johannesburg"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Postal Code <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={address.postalCode}
                onChange={(e) => updateField('postalCode', e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="e.g. 2001"
                maxLength={4}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Province */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Province <span className="text-red-500">*</span></label>
            <select
              value={address.province}
              onChange={(e) => updateField('province', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {SA_PROVINCES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* POPIA Consent */}
          <label className="flex items-start gap-3 cursor-pointer group p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <input
              type="checkbox"
              checked={popiaConsent}
              onChange={(e) => onConsentChange(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Shield className="w-3 h-3 text-blue-600" />
                <span className="text-xs font-semibold text-blue-800">POPIA Address Consent</span>
              </div>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                I consent to my delivery address being securely stored and shared with the seller solely for shipping purposes. 
                My address will be encrypted and deleted after order completion per POPIA data minimization.
              </p>
            </div>
          </label>
        </div>
      )}
    </div>
  );
};

export default DeliveryAddressForm;
