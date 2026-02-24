import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, Wifi, RefreshCw, CloudOff, Cloud, AlertTriangle } from 'lucide-react';
import { syncQueuedMessages, getQueuedMessages } from '@/lib/offline-db';

const OfflineIndicator: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showOnlineBanner, setShowOnlineBanner] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);

  // Check queued messages count
  const checkQueue = useCallback(async () => {
    try {
      const queue = await getQueuedMessages();
      setQueuedCount(queue.length);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setShowOnlineBanner(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowOnlineBanner(true);
      
      // Auto-sync when back online
      handleSync();
      
      // Hide "back online" banner after 4 seconds
      setTimeout(() => setShowOnlineBanner(false), 4000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Listen for SW sync events
    const handleSyncComplete = () => {
      checkQueue();
    };
    window.addEventListener('sw-sync-complete', handleSyncComplete);

    // Listen for queued messages
    const handleMessageQueued = () => {
      checkQueue();
    };
    window.addEventListener('sw-message-queued', handleMessageQueued);

    // Initial queue check
    checkQueue();

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('sw-sync-complete', handleSyncComplete);
      window.removeEventListener('sw-message-queued', handleMessageQueued);
    };
  }, [checkQueue]);

  const handleSync = async () => {
    if (syncing || !navigator.onLine) return;
    setSyncing(true);
    setSyncResult(null);

    try {
      const result = await syncQueuedMessages();
      setSyncResult(result);
      await checkQueue();

      if (result.synced > 0) {
        // Clear result after 3 seconds
        setTimeout(() => setSyncResult(null), 3000);
      }
    } catch (err) {
      console.warn('[Offline] Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Offline Banner
  if (isOffline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] animate-in slide-in-from-top-2 duration-300">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-3">
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">You're offline</span>
              <span className="text-amber-100 hidden sm:inline">
                — Browsing cached content. Messages will be sent when you reconnect.
              </span>
            </div>
            {queuedCount > 0 && (
              <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                {queuedCount} queued
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Back Online Banner (temporary)
  if (showOnlineBanner) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] animate-in slide-in-from-top-2 duration-300">
        <div className="bg-gradient-to-r from-emerald-500 to-green-500 text-white">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-3">
            <Wifi className="w-4 h-4 flex-shrink-0" />
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">Back online!</span>
              {syncing && (
                <span className="flex items-center gap-1 text-emerald-100">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Syncing...
                </span>
              )}
              {syncResult && syncResult.synced > 0 && (
                <span className="text-emerald-100">
                  {syncResult.synced} message{syncResult.synced !== 1 ? 's' : ''} sent
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Queued messages indicator (subtle, shown when online but has queued items)
  if (queuedCount > 0 && !syncing) {
    return (
      <div className="fixed top-16 right-4 z-[90]">
        <button
          onClick={handleSync}
          className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl shadow-lg hover:bg-amber-100 transition-all text-xs font-medium"
        >
          <CloudOff className="w-3.5 h-3.5" />
          {queuedCount} unsent message{queuedCount !== 1 ? 's' : ''}
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return null;
};

export default OfflineIndicator;
