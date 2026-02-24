import React, { useState, useEffect, useCallback } from 'react';
import { X, Download, Wifi, WifiOff, Smartphone, Zap, ArrowDown } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PWAInstallBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // Check if user dismissed the banner
    const dismissed = localStorage.getItem('snapup_pwa_dismissed');
    if (dismissed) {
      const dismissedAt = new Date(dismissed).getTime();
      const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
      // Don't show again for 14 days after dismissal
      if (daysSince < 14) return;
    }

    // Track visit count
    const visitCount = parseInt(localStorage.getItem('snapup_visit_count') || '0', 10) + 1;
    localStorage.setItem('snapup_visit_count', String(visitCount));

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Show banner after exactly 2 visits
    if (visitCount < 2) return;

    // Listen for beforeinstallprompt (Android/Chrome)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // For iOS, show custom instructions after 2 visits
    if (isIOSDevice && visitCount >= 2) {
      // Small delay to not interrupt first page load
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      };
    }

    // For browsers that don't fire beforeinstallprompt but support PWA
    // Show after a delay if the event hasn't fired
    const fallbackTimer = setTimeout(() => {
      if (!deferredPrompt && visitCount >= 2 && !isIOSDevice) {
        // Check if it's a mobile browser that might support install
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          setShowBanner(true);
        }
      }
    }, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Listen for app installed event
  useEffect(() => {
    const handleInstalled = () => {
      setShowBanner(false);
      setDeferredPrompt(null);
      localStorage.setItem('snapup_pwa_installed', 'true');
      console.log('[PWA] App installed successfully');
    };

    window.addEventListener('appinstalled', handleInstalled);
    return () => window.removeEventListener('appinstalled', handleInstalled);
  }, []);

  const handleInstall = useCallback(async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    if (!deferredPrompt) return;

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('[PWA] User accepted install prompt');
        localStorage.setItem('snapup_pwa_installed', 'true');
      } else {
        console.log('[PWA] User dismissed install prompt');
      }
      
      setDeferredPrompt(null);
      setShowBanner(false);
    } catch (err) {
      console.warn('[PWA] Install prompt failed:', err);
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt, isIOS]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    setShowIOSInstructions(false);
    localStorage.setItem('snapup_pwa_dismissed', new Date().toISOString());
  }, []);

  if (!showBanner) return null;

  // iOS Instructions Modal
  if (showIOSInstructions) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Install SnapUp</h3>
                  <p className="text-blue-100 text-xs">Add to Home Screen</p>
                </div>
              </div>
              <button onClick={handleDismiss} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-600">
              To install SnapUp on your iPhone/iPad:
            </p>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">Tap the Share button</p>
                  <p className="text-xs text-gray-500">The square with an arrow at the bottom of Safari</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">Scroll down and tap "Add to Home Screen"</p>
                  <p className="text-xs text-gray-500">You may need to scroll the action menu</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">Tap "Add" to confirm</p>
                  <p className="text-xs text-gray-500">SnapUp will appear on your home screen</p>
                </div>
              </li>
            </ol>
            
            <button
              onClick={handleDismiss}
              className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all text-sm"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Install Banner
  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 z-[90] max-w-lg mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Gradient accent bar */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600" />
        
        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* App Icon */}
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
              <span className="text-white font-black text-2xl">S</span>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-bold text-gray-900 text-sm">Add SnapUp to Home Screen</h3>
                <button
                  onClick={handleDismiss}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors ml-auto flex-shrink-0"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                Get offline access and faster browsing — great on spotty networks!
              </p>
              
              {/* Benefits */}
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
                  <WifiOff className="w-3 h-3" />
                  Works Offline
                </span>
                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                  <Zap className="w-3 h-3" />
                  Faster Loading
                </span>
                <span className="flex items-center gap-1 text-[10px] font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded-full">
                  <Smartphone className="w-3 h-3" />
                  Native Feel
                </span>
              </div>
              
              {/* Install Button */}
              <button
                onClick={handleInstall}
                disabled={installing}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 text-sm disabled:opacity-70"
              >
                {installing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    {isIOS ? 'How to Install' : 'Install App'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallBanner;
