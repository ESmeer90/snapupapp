import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PAYFAST_SANDBOX_CREDENTIALS, PAYFAST_TEST_CARDS, PAYFAST_URLS } from '@/lib/payfast';
import {
  Key, Eye, EyeOff, Save, Loader2, CheckCircle2, AlertTriangle,
  Shield, TestTube, Zap, Copy, Check, Info, Lock, Globe, RefreshCw,
  CreditCard, Server, XCircle, WifiOff, Wifi
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface PayFastCredentials {
  id?: string;
  merchant_id: string;
  merchant_key: string;
  passphrase: string;
  is_sandbox: boolean;
  is_active?: boolean;
  last_tested_at?: string;
  test_result?: string;
  updated_at?: string;
}

const PayFastCredentialsTab: React.FC = () => {
  const [credentials, setCredentials] = useState<PayFastCredentials>({
    merchant_id: '',
    merchant_key: '',
    passphrase: '',
    is_sandbox: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  // Visibility toggles
  const [showMerchantKey, setShowMerchantKey] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Test result
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    errors?: string[];
    connectivity?: { ok: boolean; message: string };
  } | null>(null);

  // Live mode warning
  const [showLiveWarning, setShowLiveWarning] = useState(false);

  // Load existing credentials
  const loadCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-payfast-credentials', {
        body: { action: 'get' },
      });
      if (error) throw error;
      if (data?.credentials) {
        setCredentials({
          id: data.credentials.id,
          merchant_id: data.credentials.merchant_id || '',
          merchant_key: data.credentials.merchant_key || '',
          passphrase: data.credentials.passphrase || '',
          is_sandbox: data.credentials.is_sandbox !== false,
          is_active: data.credentials.is_active,
          last_tested_at: data.credentials.last_tested_at,
          test_result: data.credentials.test_result,
          updated_at: data.credentials.updated_at,
        });
        setHasExisting(true);
      }
    } catch (err: any) {
      console.error('Failed to load PayFast credentials:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    }).catch(() => {});
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentials.merchant_id.trim() || !credentials.merchant_key.trim()) {
      toast({ title: 'Required fields', description: 'Merchant ID and Merchant Key are required.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    setSaved(false);
    try {
      const { data, error } = await supabase.functions.invoke('manage-payfast-credentials', {
        body: {
          action: 'save',
          merchant_id: credentials.merchant_id.trim(),
          merchant_key: credentials.merchant_key.trim(),
          passphrase: credentials.passphrase.trim(),
          is_sandbox: credentials.is_sandbox,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSaved(true);
      setHasExisting(true);
      toast({
        title: 'Credentials Saved',
        description: data?.message || `PayFast credentials saved in ${credentials.is_sandbox ? 'sandbox' : 'live'} mode.`,
      });
      setTimeout(() => setSaved(false), 4000);
      // Reload to get updated data
      loadCredentials();
    } catch (err: any) {
      toast({ title: 'Save Failed', description: err.message || 'Failed to save credentials', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!credentials.merchant_id.trim() || !credentials.merchant_key.trim()) {
      toast({ title: 'Required fields', description: 'Enter Merchant ID and Merchant Key before testing.', variant: 'destructive' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('manage-payfast-credentials', {
        body: {
          action: 'test',
          merchant_id: credentials.merchant_id.trim(),
          merchant_key: credentials.merchant_key.trim(),
          passphrase: credentials.passphrase.trim(),
          is_sandbox: credentials.is_sandbox,
        },
      });
      if (error) throw error;

      setTestResult({
        success: data?.success || false,
        message: data?.message || 'Test completed',
        errors: data?.errors,
        connectivity: data?.connectivity,
      });

      if (data?.success) {
        toast({ title: 'Test Passed', description: 'Credentials format validated successfully.' });
      } else {
        toast({ title: 'Test Failed', description: data?.message || 'Validation failed', variant: 'destructive' });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Test failed',
        errors: [err.message],
      });
      toast({ title: 'Test Error', description: err.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleModeToggle = (goLive: boolean) => {
    if (goLive) {
      setShowLiveWarning(true);
    } else {
      setCredentials(prev => ({ ...prev, is_sandbox: true }));
      setTestResult(null);
    }
  };

  const confirmLiveMode = () => {
    setCredentials(prev => ({ ...prev, is_sandbox: false }));
    setShowLiveWarning(false);
    setTestResult(null);
  };

  const fillSandboxDefaults = () => {
    setCredentials(prev => ({
      ...prev,
      merchant_id: PAYFAST_SANDBOX_CREDENTIALS.merchant_id,
      merchant_key: PAYFAST_SANDBOX_CREDENTIALS.merchant_key,
      passphrase: PAYFAST_SANDBOX_CREDENTIALS.passphrase,
      is_sandbox: true,
    }));
    setTestResult(null);
  };

  const maskValue = (val: string) => {
    if (!val || val.length <= 4) return '****';
    return '*'.repeat(val.length - 4) + val.slice(-4);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
        <Shield className="w-4 h-4 text-indigo-600 flex-shrink-0" />
        <p className="text-xs text-indigo-700">
          Securely configure your PayFast merchant credentials. These are encrypted and stored in the database, never exposed in frontend code. Only admin users can access this section.
        </p>
      </div>

      {/* Mode Toggle Card */}
      <div className={`rounded-2xl border-2 p-5 transition-all ${credentials.is_sandbox ? 'border-amber-300 bg-amber-50/50' : 'border-red-300 bg-red-50/50'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${credentials.is_sandbox ? 'bg-amber-100' : 'bg-red-100'}`}>
              {credentials.is_sandbox ? <TestTube className="w-5 h-5 text-amber-600" /> : <Zap className="w-5 h-5 text-red-600" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {credentials.is_sandbox ? 'Sandbox Mode (Testing)' : 'Live Mode (Production)'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {credentials.is_sandbox
                  ? 'No real money is charged. Safe for development and testing.'
                  : 'Real payments will be processed. Ensure credentials are correct.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleModeToggle(!credentials.is_sandbox)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              credentials.is_sandbox ? 'bg-amber-500' : 'bg-red-500'
            }`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
              credentials.is_sandbox ? 'translate-x-1' : 'translate-x-6'
            }`} />
          </button>
        </div>

        {/* Mode Status Bar */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${credentials.is_sandbox ? 'bg-amber-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className={`text-xs font-medium ${credentials.is_sandbox ? 'text-amber-700' : 'text-gray-400'}`}>Sandbox</span>
          </div>
          <div className="flex-1 h-px bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${!credentials.is_sandbox ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className={`text-xs font-medium ${!credentials.is_sandbox ? 'text-red-700' : 'text-gray-400'}`}>Live</span>
          </div>
        </div>

        {credentials.is_sandbox && (
          <button
            onClick={fillSandboxDefaults}
            className="mt-3 flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Fill Sandbox Test Credentials
          </button>
        )}
      </div>

      {/* Credentials Form */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Key className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">PayFast Merchant Credentials</h3>
            <p className="text-sm text-gray-500">Enter your credentials from the PayFast merchant dashboard</p>
          </div>
        </div>

        {/* Merchant ID */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Merchant ID <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
            <input
              type="text"
              value={credentials.merchant_id}
              onChange={(e) => setCredentials(prev => ({ ...prev, merchant_id: e.target.value.replace(/\D/g, '') }))}
              placeholder="e.g. 10000100"
              maxLength={15}
              className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm font-mono"
              required
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Your numeric PayFast merchant ID (found in PayFast dashboard)</p>
        </div>

        {/* Merchant Key */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Merchant Key <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
            <input
              type={showMerchantKey ? 'text' : 'password'}
              value={credentials.merchant_key}
              onChange={(e) => setCredentials(prev => ({ ...prev, merchant_key: e.target.value }))}
              placeholder="e.g. 46f0cd694581a"
              maxLength={20}
              className="w-full pl-11 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm font-mono"
              required
            />
            <button
              type="button"
              onClick={() => setShowMerchantKey(!showMerchantKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-all"
              title={showMerchantKey ? 'Hide' : 'Show'}
            >
              {showMerchantKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Stored encrypted — never exposed in frontend code
          </p>
        </div>

        {/* Passphrase */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Passphrase <span className="text-xs text-gray-400 font-normal">(optional but recommended)</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
            <input
              type={showPassphrase ? 'text' : 'password'}
              value={credentials.passphrase}
              onChange={(e) => setCredentials(prev => ({ ...prev, passphrase: e.target.value }))}
              placeholder="e.g. jt7NOE43FZPn"
              maxLength={50}
              className="w-full pl-11 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassphrase(!showPassphrase)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-all"
              title={showPassphrase ? 'Hide' : 'Show'}
            >
              {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Used for ITN (Instant Transaction Notification) signature validation. Set this in your PayFast dashboard under Settings &gt; Security.
          </p>
        </div>

        {/* Security Notice */}
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <div className="flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 space-y-1.5">
              <p><strong>How credentials are secured:</strong></p>
              <ul className="space-y-1 ml-2">
                <li className="flex items-start gap-1.5">
                  <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                  <span>Merchant Key and Passphrase are <strong>obfuscated/encrypted</strong> before storage</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                  <span>Credentials are <strong>never sent to the browser</strong> during checkout — only used server-side in edge functions</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                  <span>Database access is restricted to <strong>admin role only</strong> via Row Level Security (RLS)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                  <span>The checkout flow reads credentials <strong>server-side only</strong> to generate the PayFast signature</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`rounded-xl p-4 border ${testResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-start gap-2.5">
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-semibold ${testResult.success ? 'text-emerald-800' : 'text-red-800'}`}>
                  {testResult.success ? 'Validation Passed' : 'Validation Failed'}
                </p>
                <p className={`text-xs mt-1 ${testResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
                  {testResult.message}
                </p>
                {testResult.errors && testResult.errors.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {testResult.errors.map((err, i) => (
                      <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        {err}
                      </li>
                    ))}
                  </ul>
                )}
                {testResult.connectivity && (
                  <div className="mt-2 flex items-center gap-1.5">
                    {testResult.connectivity.ok ? (
                      <Wifi className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <WifiOff className="w-3 h-3 text-red-600" />
                    )}
                    <span className={`text-xs ${testResult.connectivity.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                      {testResult.connectivity.message}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Last Test Info */}
        {hasExisting && credentials.last_tested_at && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Info className="w-3 h-3" />
            Last tested: {new Date(credentials.last_tested_at).toLocaleString('en-ZA')}
            {credentials.test_result && (
              <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                credentials.test_result === 'pass' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {credentials.test_result === 'pass' ? 'Passed' : 'Failed'}
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !credentials.merchant_id || !credentials.merchant_key}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <TestTube className="w-4 h-4" />
            )}
            Test Connection
          </button>
          <button
            type="submit"
            disabled={saving || !credentials.merchant_id || !credentials.merchant_key}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-200 text-sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Credentials'}
          </button>
        </div>
        {saved && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-sm text-emerald-700 font-medium">
              Credentials saved securely. The checkout flow will now use these credentials.
            </span>
          </div>
        )}
      </form>

      {/* Sandbox Test Cards Reference */}
      {credentials.is_sandbox && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-amber-600" />
            <h4 className="text-sm font-bold text-amber-800">Sandbox Test Card Numbers</h4>
          </div>
          <div className="space-y-2">
            {PAYFAST_TEST_CARDS.map((card) => (
              <div key={card.number} className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-2">
                <div>
                  <span className="text-[10px] text-amber-600 font-medium">{card.type}</span>
                  <p className="text-xs font-mono font-bold text-amber-900">{card.number}</p>
                </div>
                <button
                  onClick={() => handleCopy(card.number.replace(/\s/g, ''), `card-${card.number}`)}
                  className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-all"
                  title="Copy"
                >
                  {copiedField === `card-${card.number}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
            <p className="text-[10px] text-amber-600 mt-1">CVV: 123 | Expiry: Any future date</p>
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5">
        <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-gray-500" />
          How PayFast Integration Works
        </h4>
        <div className="space-y-3">
          {[
            {
              step: '1',
              title: 'You save credentials here',
              desc: 'Merchant ID, Key, and Passphrase are encrypted and stored in the database.',
            },
            {
              step: '2',
              title: 'Buyer clicks "Buy Now"',
              desc: 'The checkout flow calls a server-side edge function to create the order.',
            },
            {
              step: '3',
              title: 'Edge function reads credentials',
              desc: 'The server reads your saved credentials from the database (never exposed to the browser).',
            },
            {
              step: '4',
              title: 'MD5 signature is generated',
              desc: 'A secure signature is generated server-side using your passphrase per PayFast docs.',
            },
            {
              step: '5',
              title: 'Buyer is redirected to PayFast',
              desc: 'The signed form is submitted to PayFast for secure payment processing.',
            },
            {
              step: '6',
              title: 'ITN callback validates payment',
              desc: 'PayFast sends an Instant Transaction Notification, verified using your passphrase.',
            },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-blue-700">{item.step}</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">{item.title}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Mode Warning Modal */}
      {showLiveWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowLiveWarning(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-900">Switch to Live Mode?</h3>
                <p className="text-sm text-red-600">Real payments will be processed</p>
              </div>
            </div>

            <div className="bg-red-50 rounded-xl p-4 mb-4 border border-red-200">
              <ul className="space-y-2 text-sm text-red-800">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span><strong>Real money</strong> will be charged to buyers</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>Ensure your <strong>live credentials</strong> are correct</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>Test with sandbox first before going live</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowLiveWarning(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
              >
                Stay in Sandbox
              </button>
              <button
                onClick={confirmLiveMode}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Switch to Live
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayFastCredentialsTab;
