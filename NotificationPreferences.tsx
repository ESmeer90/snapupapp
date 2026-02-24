import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribedToPush,
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestNotification,
  type NotificationPreferences as NotifPrefs,
} from '@/lib/push-notifications';
import { playNotificationChime, setSoundEnabled, isSoundEnabled } from '@/lib/notification-sound';
import {
  Bell, BellOff, BellRing, MessageSquare, Package, TrendingDown,
  Tag, Megaphone, Loader2, CheckCircle2, AlertTriangle, Shield,
  Smartphone, X, Info, Zap, WifiOff, Volume2, VolumeX, RefreshCw
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const NotificationPreferences: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [pushSupported] = useState(isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [preferences, setPreferences] = useState<NotifPrefs>({
    new_messages: true,
    order_updates: true,
    price_drops: true,
    new_offers: true,
    marketing: false,
    push_enabled: false,
    sound_enabled: true,
  });
  const [showPermissionFlow, setShowPermissionFlow] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [soundSaving, setSoundSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Load preferences and subscription status
  const loadState = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [prefs, subscribed, perm, soundPref] = await Promise.all([
        getNotificationPreferences(user.id),
        pushSupported ? isSubscribedToPush() : false,
        Promise.resolve(getNotificationPermission()),
        isSoundEnabled(user.id),
      ]);
      setPreferences(prefs);
      setIsSubscribed(subscribed || prefs.push_enabled);
      setPermission(perm);
      setSoundEnabledState(soundPref);
    } catch (err) {
      console.error('[NotifPrefs] Load error:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [user, pushSupported]);

  useEffect(() => { loadState(); }, [loadState]);

  // Handle enabling push notifications
  const handleEnablePush = async () => {
    if (!user) return;
    setSubscribing(true);
    try {
      const success = await subscribeToPush(user.id);
      if (success) {
        setIsSubscribed(true);
        setPermission('granted');
        setPreferences(prev => ({ ...prev, push_enabled: true }));
        setShowPermissionFlow(false);
        toast({ 
          title: 'Notifications enabled!', 
          description: 'You will receive push notifications for important updates.',
        });
        
        // Send test notification after a short delay
        setTimeout(() => {
          sendTestNotification(user.id).catch(() => {});
        }, 1500);
      } else {
        const perm = getNotificationPermission();
        setPermission(perm);
        if (perm === 'denied') {
          toast({
            title: 'Permission denied',
            description: 'Push notifications were blocked. You can enable them in your browser settings.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Could not enable notifications',
            description: 'Please try again. Make sure you allow notifications when prompted.',
            variant: 'destructive',
          });
        }
      }
    } catch (err: any) {
      console.error('[NotifPrefs] Enable push error:', err);
      toast({ title: 'Error', description: err.message || 'Failed to enable notifications', variant: 'destructive' });
    } finally {
      setSubscribing(false);
    }
  };

  // Handle disabling push notifications
  const handleDisablePush = async () => {
    if (!user) return;
    setSubscribing(true);
    try {
      const success = await unsubscribeFromPush(user.id);
      if (success) {
        setIsSubscribed(false);
        setPreferences(prev => ({ ...prev, push_enabled: false }));
        toast({ title: 'Notifications disabled', description: 'You will no longer receive push notifications.' });
      } else {
        toast({ title: 'Error', description: 'Failed to disable notifications. Please try again.', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('[NotifPrefs] Disable push error:', err);
      toast({ title: 'Error', description: err.message || 'Failed to disable notifications', variant: 'destructive' });
    } finally {
      setSubscribing(false);
    }
  };

  // Handle preference toggle with optimistic update + rollback
  const handleToggle = async (key: keyof NotifPrefs, value: boolean) => {
    if (!user) return;
    const oldPrefs = { ...preferences };
    setPreferences(prev => ({ ...prev, [key]: value }));
    setSavingKey(key);
    setSaving(true);
    try {
      const success = await updateNotificationPreferences(user.id, { [key]: value });
      if (success) {
        toast({ 
          title: value ? `${getLabel(key)} enabled` : `${getLabel(key)} disabled`,
          description: value 
            ? `You'll receive ${getLabel(key).toLowerCase()} notifications.`
            : `${getLabel(key)} notifications turned off.`,
        });
      } else {
        setPreferences(oldPrefs);
        toast({ title: 'Error', description: 'Failed to save preference. Please try again.', variant: 'destructive' });
      }
    } catch {
      setPreferences(oldPrefs);
      toast({ title: 'Error', description: 'Failed to save preference. Check your connection.', variant: 'destructive' });
    } finally {
      setSaving(false);
      setSavingKey(null);
    }
  };

  const getLabel = (key: keyof NotifPrefs): string => {
    const labels: Record<string, string> = {
      new_messages: 'New Messages',
      order_updates: 'Order Updates',
      price_drops: 'Price Drops',
      new_offers: 'New Offers',
      marketing: 'Promotions',
      push_enabled: 'Push',
      sound_enabled: 'Sound',
    };
    return labels[key] || key;
  };

  // Handle sound toggle
  const handleSoundToggle = async () => {
    if (!user) return;
    const newValue = !soundEnabled;
    setSoundSaving(true);
    setSoundEnabledState(newValue);
    try {
      const success = await setSoundEnabled(user.id, newValue);
      if (success) {
        if (newValue) {
          playNotificationChime();
        }
        toast({
          title: newValue ? 'Sound enabled' : 'Sound disabled',
          description: newValue
            ? 'You will hear a chime when new notifications arrive.'
            : 'Notification sounds have been muted.',
        });
      } else {
        setSoundEnabledState(!newValue);
        toast({ title: 'Error', description: 'Failed to update sound preference', variant: 'destructive' });
      }
    } catch {
      setSoundEnabledState(!newValue);
    } finally {
      setSoundSaving(false);
    }
  };

  // Send test notification
  const handleTestNotification = async () => {
    if (!user) return;
    setTestSending(true);
    try {
      await sendTestNotification(user.id);
      toast({ title: 'Test sent!', description: 'Check your notification tray for the test notification.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to send test notification', variant: 'destructive' });
    } finally {
      setTestSending(false);
    }
  };

  if (!user) return null;

  const notificationTypes = [
    {
      key: 'new_messages' as keyof NotifPrefs,
      icon: MessageSquare,
      label: 'New Messages',
      description: 'Get notified when buyers or sellers send you a message',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      key: 'order_updates' as keyof NotifPrefs,
      icon: Package,
      label: 'Order Status Updates',
      description: 'Shipping confirmations, delivery updates, and payment status',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
    },
    {
      key: 'price_drops' as keyof NotifPrefs,
      icon: TrendingDown,
      label: 'Price Drops on Saved Items',
      description: 'Alert when items in your favourites or price alerts drop in price',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
    {
      key: 'new_offers' as keyof NotifPrefs,
      icon: Tag,
      label: 'New Offers on Your Listings',
      description: 'Get notified when someone makes an offer on your listing',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      key: 'marketing' as keyof NotifPrefs,
      icon: Megaphone,
      label: 'Promotions & Tips',
      description: 'Occasional selling tips, feature updates, and special offers',
      color: 'text-pink-600',
      bgColor: 'bg-pink-100',
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSubscribed ? 'bg-blue-100' : 'bg-gray-100'}`}>
            {isSubscribed ? <BellRing className="w-5 h-5 text-blue-600" /> : <BellOff className="w-5 h-5 text-gray-400" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Push Notifications</h2>
            <p className="text-sm text-gray-500">
              {isSubscribed ? 'Notifications are active' : 'Enable to get instant alerts'}
            </p>
          </div>
        </div>
        {saving && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <p className="text-sm text-gray-600 text-center">Failed to load notification preferences</p>
          <button
            onClick={loadState}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Push Support Check */}
          {!pushSupported && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Push notifications not supported</p>
                <p className="text-xs text-amber-700 mt-1">
                  Your browser doesn't support push notifications. Try using Chrome, Firefox, or Edge on Android, or Safari on iOS 16.4+.
                </p>
              </div>
            </div>
          )}

          {/* Permission Denied State */}
          {pushSupported && permission === 'denied' && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <BellOff className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Notifications blocked</p>
                <p className="text-xs text-red-700 mt-1">
                  You've blocked notifications for SnapUp. To re-enable:
                </p>
                <ol className="text-xs text-red-700 mt-2 space-y-1 list-decimal list-inside">
                  <li>Click the lock/info icon in your browser's address bar</li>
                  <li>Find "Notifications" and change to "Allow"</li>
                  <li>Reload this page</li>
                </ol>
              </div>
            </div>
          )}

          {/* Enable/Disable Push Toggle */}
          {pushSupported && permission !== 'denied' && (
            <div className={`p-4 rounded-xl border-2 transition-all ${
              isSubscribed ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isSubscribed ? 'bg-blue-200' : 'bg-gray-200'
                  }`}>
                    {isSubscribed ? (
                      <Bell className="w-5 h-5 text-blue-700" />
                    ) : (
                      <BellOff className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {isSubscribed ? 'Push notifications enabled' : 'Enable push notifications'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isSubscribed
                        ? 'Receiving instant alerts on this device'
                        : 'Get instant alerts when buyers message you'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={isSubscribed ? handleDisablePush : () => setShowPermissionFlow(true)}
                  disabled={subscribing}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                    isSubscribed ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  {subscribing ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin mx-auto" />
                  ) : (
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                      isSubscribed ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  )}
                </button>
              </div>

              {/* Success indicator */}
              {isSubscribed && (
                <div className="mt-3 pt-3 border-t border-blue-200/50 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-blue-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Saved and active</span>
                  </div>
                  <button
                    onClick={handleTestNotification}
                    disabled={testSending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-all disabled:opacity-50"
                  >
                    {testSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    Send Test Notification
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============ NOTIFICATION SOUND TOGGLE ============ */}
          <div className={`p-4 rounded-xl border-2 transition-all ${
            soundEnabled ? 'border-indigo-200 bg-indigo-50/50' : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  soundEnabled ? 'bg-indigo-200' : 'bg-gray-200'
                }`}>
                  {soundEnabled ? (
                    <Volume2 className="w-5 h-5 text-indigo-700" />
                  ) : (
                    <VolumeX className="w-5 h-5 text-gray-500" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {soundEnabled ? 'Notification sound enabled' : 'Notification sound disabled'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {soundEnabled
                      ? 'A subtle chime plays when new notifications arrive'
                      : 'Notifications arrive silently'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSoundToggle}
                disabled={soundSaving}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 ${
                  soundEnabled ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
              >
                {soundSaving ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin mx-auto" />
                ) : (
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                    soundEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                )}
              </button>
            </div>

            {/* Preview sound button */}
            {soundEnabled && (
              <div className="mt-3 pt-3 border-t border-indigo-200/50">
                <button
                  onClick={() => playNotificationChime()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-all"
                >
                  <Volume2 className="w-3 h-3" />
                  Preview Sound
                </button>
              </div>
            )}
          </div>

          {/* Permission Request Flow Modal */}
          {showPermissionFlow && !isSubscribed && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowPermissionFlow(false)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="p-6">
                  {/* Illustration */}
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <BellRing className="w-10 h-10 text-blue-600" />
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
                    Stay in the loop
                  </h3>
                  <p className="text-sm text-gray-500 text-center mb-5">
                    Get instant alerts when buyers message you, orders update, or prices drop on items you're watching.
                  </p>

                  {/* Benefits */}
                  <div className="space-y-3 mb-6">
                    {[
                      { icon: MessageSquare, text: 'Never miss a buyer message', color: 'text-blue-600 bg-blue-50' },
                      { icon: Package, text: 'Real-time order & delivery updates', color: 'text-emerald-600 bg-emerald-50' },
                      { icon: TrendingDown, text: 'Price drop alerts on saved items', color: 'text-orange-600 bg-orange-50' },
                      { icon: WifiOff, text: 'Works even on spotty 3G/4G networks', color: 'text-purple-600 bg-purple-50' },
                    ].map(({ icon: Icon, text, color }) => (
                      <div key={text} className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color.split(' ')[1]}`}>
                          <Icon className={`w-4 h-4 ${color.split(' ')[0]}`} />
                        </div>
                        <span className="text-sm text-gray-700">{text}</span>
                      </div>
                    ))}
                  </div>

                  {/* SA-specific note */}
                  <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100 mb-5">
                    <Smartphone className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700">
                      <strong>Great for spotty networks!</strong> Notifications arrive even when your connection drops — perfect for rural areas and anywhere with intermittent 3G/4G.
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <button
                      onClick={handleEnablePush}
                      disabled={subscribing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
                    >
                      {subscribing ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Bell className="w-5 h-5" />
                      )}
                      {subscribing ? 'Enabling...' : 'Enable Notifications'}
                    </button>
                    <button
                      onClick={() => setShowPermissionFlow(false)}
                      className="w-full px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-all"
                    >
                      Maybe later
                    </button>
                  </div>

                  <p className="text-[10px] text-gray-400 text-center mt-3 flex items-center justify-center gap-1">
                    <Shield className="w-3 h-3" />
                    You can disable notifications anytime in Settings
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Notification Type Toggles */}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Notification Types</h3>
            {notificationTypes.map(({ key, icon: Icon, label, description, color, bgColor }) => {
              const isToggling = savingKey === key;
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                    preferences[key] ? 'bg-gray-50' : 'bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      preferences[key] ? bgColor : 'bg-gray-100'
                    }`}>
                      <Icon className={`w-4.5 h-4.5 ${preferences[key] ? color : 'text-gray-400'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${preferences[key] ? 'text-gray-900' : 'text-gray-500'}`}>
                        {label}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {isToggling && <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />}
                    <button
                      onClick={() => handleToggle(key, !preferences[key])}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-40 ${
                        preferences[key] ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                        preferences[key] ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {!isSubscribed && pushSupported && permission !== 'denied' && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Enable push notifications above to receive instant alerts on your device. You can still control which types of notifications you receive using the toggles above — preferences are saved even without push enabled.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationPreferences;
