import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  Mail, Bell, BellOff, Loader2, CheckCircle2, Save, Shield,
  Package, Truck, CreditCard, AlertTriangle, ShoppingBag, Megaphone, Info, RefreshCw
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface EmailPrefs {
  order_confirmation: boolean;
  new_order_seller: boolean;
  payment_received: boolean;
  shipping_updates: boolean;
  delivery_confirmation: boolean;
  dispute_updates: boolean;
  promotional: boolean;
}

const DEFAULT_PREFS: EmailPrefs = {
  order_confirmation: true,
  new_order_seller: true,
  payment_received: true,
  shipping_updates: true,
  delivery_confirmation: true,
  dispute_updates: true,
  promotional: false,
};

const PREF_CONFIG: {
  key: keyof EmailPrefs;
  label: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  critical?: boolean;
}[] = [
  {
    key: 'order_confirmation',
    label: 'Order Confirmation',
    description: 'Receive an email when you place an order confirming your purchase details.',
    icon: <ShoppingBag className="w-4 h-4 text-blue-600" />,
    iconBg: 'bg-blue-100',
    critical: true,
  },
  {
    key: 'new_order_seller',
    label: 'New Order Alerts (Seller)',
    description: 'Get notified when a buyer purchases one of your listed items.',
    icon: <Bell className="w-4 h-4 text-emerald-600" />,
    iconBg: 'bg-emerald-100',
    critical: true,
  },
  {
    key: 'payment_received',
    label: 'Payment Received',
    description: 'Confirmation when payment is processed and funds are secured in escrow.',
    icon: <CreditCard className="w-4 h-4 text-green-600" />,
    iconBg: 'bg-green-100',
  },
  {
    key: 'shipping_updates',
    label: 'Shipping & Tracking Updates',
    description: 'Updates when your order is shipped, in transit, out for delivery, or delivered.',
    icon: <Truck className="w-4 h-4 text-indigo-600" />,
    iconBg: 'bg-indigo-100',
  },
  {
    key: 'delivery_confirmation',
    label: 'Delivery Confirmation',
    description: 'Notification when your package has been delivered and needs confirmation.',
    icon: <Package className="w-4 h-4 text-purple-600" />,
    iconBg: 'bg-purple-100',
  },
  {
    key: 'dispute_updates',
    label: 'Dispute Resolution',
    description: 'Updates on dispute status changes and resolution outcomes.',
    icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
    iconBg: 'bg-amber-100',
    critical: true,
  },
  {
    key: 'promotional',
    label: 'Promotional Emails',
    description: 'Special offers, marketplace news, and feature announcements.',
    icon: <Megaphone className="w-4 h-4 text-pink-600" />,
    iconBg: 'bg-pink-100',
  },
];

const EmailPreferencesSection: React.FC = () => {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<EmailPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalPrefs, setOriginalPrefs] = useState<EmailPrefs>(DEFAULT_PREFS);
  const [rowExists, setRowExists] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadPreferences();
  }, [user]);

  const loadPreferences = async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase
        .from('email_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[EmailPrefs] Load error:', error);
        setLoadError(true);
        return;
      }

      if (data) {
        setRowExists(true);
        const loaded: EmailPrefs = {
          order_confirmation: data.order_confirmation ?? true,
          new_order_seller: data.new_order_seller ?? true,
          payment_received: data.payment_received ?? true,
          shipping_updates: data.shipping_updates ?? true,
          delivery_confirmation: data.delivery_confirmation ?? true,
          dispute_updates: data.dispute_updates ?? true,
          promotional: data.promotional ?? false,
        };
        setPrefs(loaded);
        setOriginalPrefs(loaded);
      } else {
        setRowExists(false);
      }
    } catch (err) {
      console.error('[EmailPrefs] Load exception:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: keyof EmailPrefs) => {
    setPrefs(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalPrefs));
      return updated;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    try {
      if (rowExists) {
        // Update existing row
        const { error } = await supabase
          .from('email_preferences')
          .update({
            ...prefs,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Insert new row
        const { error } = await supabase
          .from('email_preferences')
          .insert({
            user_id: user.id,
            ...prefs,
            updated_at: new Date().toISOString(),
          });

        if (error) {
          // If insert fails due to conflict, try update
          console.warn('[EmailPrefs] Insert failed, trying update:', error.message);
          const { error: updateError } = await supabase
            .from('email_preferences')
            .update({
              ...prefs,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id);

          if (updateError) throw updateError;
        }
        setRowExists(true);
      }

      setOriginalPrefs(prefs);
      setHasChanges(false);
      setSaved(true);
      toast({ title: 'Preferences saved!', description: 'Your email notification preferences have been updated.' });
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      console.error('[EmailPrefs] Save error:', err);
      toast({ 
        title: 'Error saving preferences', 
        description: err.message || 'Failed to save preferences. Please try again.', 
        variant: 'destructive' 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEnableAll = () => {
    const allOn: EmailPrefs = {
      order_confirmation: true,
      new_order_seller: true,
      payment_received: true,
      shipping_updates: true,
      delivery_confirmation: true,
      dispute_updates: true,
      promotional: true,
    };
    setPrefs(allOn);
    setHasChanges(JSON.stringify(allOn) !== JSON.stringify(originalPrefs));
  };

  const handleDisableNonEssential = () => {
    const minimal: EmailPrefs = {
      order_confirmation: true,
      new_order_seller: true,
      payment_received: false,
      shipping_updates: false,
      delivery_confirmation: false,
      dispute_updates: true,
      promotional: false,
    };
    setPrefs(minimal);
    setHasChanges(JSON.stringify(minimal) !== JSON.stringify(originalPrefs));
  };

  const enabledCount = Object.values(prefs).filter(Boolean).length;
  const totalCount = Object.keys(prefs).length;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Mail className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Email Notifications</h2>
            <p className="text-sm text-gray-500">Loading preferences...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Mail className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Email Notifications</h2>
            <p className="text-sm text-red-500">Failed to load preferences</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <p className="text-sm text-gray-600 text-center">Could not load your email preferences</p>
          <button
            onClick={loadPreferences}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Mail className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Email Notifications</h2>
            <p className="text-sm text-gray-500">
              {enabledCount}/{totalCount} notifications enabled
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEnableAll}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-all"
          >
            Enable All
          </button>
          <button
            onClick={handleDisableNonEssential}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-all"
          >
            Essential Only
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${(enabledCount / totalCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Preference toggles */}
      <div className="space-y-1">
        {PREF_CONFIG.map((config) => (
          <div
            key={config.key}
            className={`flex items-center justify-between p-3.5 rounded-xl transition-all ${
              prefs[config.key] ? 'bg-gray-50' : 'bg-white'
            } hover:bg-gray-50`}
          >
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={`w-8 h-8 ${config.iconBg} rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5`}>
                {config.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{config.label}</span>
                  {config.critical && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 rounded-full uppercase tracking-wider">
                      Important
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{config.description}</p>
              </div>
            </div>
            <button
              onClick={() => handleToggle(config.key)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex-shrink-0 ml-3 ${
                prefs[config.key] ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
              role="switch"
              aria-checked={prefs[config.key]}
              aria-label={`Toggle ${config.label}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  prefs[config.key] ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Info notice */}
      <div className="mt-5 bg-blue-50 rounded-xl p-3 border border-blue-100">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 space-y-1">
            <p>
              <strong>Important notifications</strong> (order confirmation, new order alerts, dispute updates) are recommended to stay enabled for a smooth marketplace experience.
            </p>
            <p>
              All emails include a public tracking link so you can check delivery status anytime. Emails are sent via SendGrid and comply with POPIA.
            </p>
          </div>
        </div>
      </div>

      {/* POPIA notice */}
      <div className="mt-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-500">
            Under POPIA, you have the right to opt out of non-essential communications. Transactional emails required for order processing may still be sent regardless of preferences.
          </p>
        </div>
      </div>

      {/* Save button - always visible when changes exist */}
      {hasChanges && (
        <div className="mt-5 flex items-center gap-3 pt-4 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-indigo-200 text-sm"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4" /> Save Preferences</>
            )}
          </button>
          <button
            onClick={() => {
              setPrefs(originalPrefs);
              setHasChanges(false);
            }}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all"
          >
            Cancel
          </button>
        </div>
      )}

      {saved && !hasChanges && (
        <div className="mt-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span className="text-sm text-emerald-700 font-medium">Email preferences saved successfully</span>
        </div>
      )}
    </div>
  );
};

export default EmailPreferencesSection;
