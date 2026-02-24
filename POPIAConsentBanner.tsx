import React, { useState, useEffect } from 'react';
import { Shield, X, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

const CONSENT_KEY = 'snapup_popia_consent';
const CONSENT_VERSION = '1.0';

interface ConsentData {
  version: string;
  accepted: boolean;
  timestamp: string;
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

const POPIAConsentBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(true);
  const [marketingConsent, setMarketingConsent] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored) {
        const data: ConsentData = JSON.parse(stored);
        if (data.version === CONSENT_VERSION && data.accepted) {
          setVisible(false);
          return;
        }
      }
      // Show banner after a short delay for better UX
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    } catch {
      setVisible(true);
    }
  }, []);

  const saveConsent = (accepted: boolean, analytics: boolean, marketing: boolean) => {
    const data: ConsentData = {
      version: CONSENT_VERSION,
      accepted,
      timestamp: new Date().toISOString(),
      essential: true, // Always required
      analytics,
      marketing,
    };
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(data));
    } catch {
      // localStorage might be full or disabled
    }
    setVisible(false);
  };

  const handleAcceptAll = () => {
    saveConsent(true, true, true);
  };

  const handleAcceptEssential = () => {
    saveConsent(true, false, false);
  };

  const handleSavePreferences = () => {
    saveConsent(true, analyticsConsent, marketingConsent);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] md:bottom-4 md:left-4 md:right-auto md:max-w-lg animate-in slide-in-from-bottom duration-500">
      <div className="bg-white border border-gray-200 shadow-2xl rounded-t-2xl md:rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-gray-900">Your Privacy Matters</h3>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                SnapUp uses cookies and processes personal data in accordance with South Africa's 
                <strong> Protection of Personal Information Act (POPIA)</strong>. We only collect data 
                necessary to provide our services.
              </p>
            </div>
            <button
              onClick={() => setVisible(false)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-all flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Details Toggle */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium mt-3 transition-colors"
          >
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showDetails ? 'Hide details' : 'Manage preferences'}
          </button>

          {/* Detailed Preferences */}
          {showDetails && (
            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
              {/* Essential */}
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="mt-0.5">
                  <div className="w-9 h-5 bg-blue-600 rounded-full relative cursor-not-allowed">
                    <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Essential Cookies</p>
                  <p className="text-xs text-gray-500 mt-0.5">Required for authentication, security, and core functionality. Cannot be disabled.</p>
                </div>
              </div>

              {/* Analytics */}
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <button
                  onClick={() => setAnalyticsConsent(!analyticsConsent)}
                  className={`mt-0.5 w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${
                    analyticsConsent ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                    analyticsConsent ? 'right-0.5' : 'left-0.5'
                  }`} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Analytics</p>
                  <p className="text-xs text-gray-500 mt-0.5">Help us understand how you use SnapUp to improve our service. Data is anonymized.</p>
                </div>
              </div>

              {/* Marketing */}
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <button
                  onClick={() => setMarketingConsent(!marketingConsent)}
                  className={`mt-0.5 w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${
                    marketingConsent ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                    marketingConsent ? 'right-0.5' : 'left-0.5'
                  }`} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Marketing</p>
                  <p className="text-xs text-gray-500 mt-0.5">Receive personalized recommendations and promotional content. You can opt out anytime.</p>
                </div>
              </div>

              {/* Save Preferences */}
              <button
                onClick={handleSavePreferences}
                className="w-full py-2.5 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all border border-blue-200"
              >
                Save Preferences
              </button>
            </div>
          )}

          {/* Action Buttons */}
          {!showDetails && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleAcceptEssential}
                className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
              >
                Essential Only
              </button>
              <button
                onClick={handleAcceptAll}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-200"
              >
                Accept All
              </button>
            </div>
          )}

          {/* Privacy Policy Link */}
          <div className="flex items-center justify-center gap-1.5 mt-3">
            <a
              href="/privacy-policy"
              className="text-xs text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Read our Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POPIAConsentBanner;
