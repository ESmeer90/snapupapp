import React, { useState, useRef, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
  threshold?: number;
  maxPull?: number;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  disabled = false,
  threshold = 60,
  maxPull = 120,
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isPullingRef = useRef(false);
  const isRefreshingRef = useRef(false);

  // Check if the container is scrolled to the top
  const isAtTop = useCallback((): boolean => {
    // Check if the page itself is at the top
    if (window.scrollY > 5) return false;
    // Also check if any parent scrollable element is scrolled
    let el = containerRef.current;
    while (el) {
      if (el.scrollTop > 5) return false;
      el = el.parentElement as HTMLDivElement | null;
    }
    return true;
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshingRef.current) return;
    if (!isAtTop()) return;

    startYRef.current = e.touches[0].clientY;
    currentYRef.current = e.touches[0].clientY;
    isPullingRef.current = false;
  }, [disabled, isAtTop]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshingRef.current) return;
    if (startYRef.current === 0) return;

    currentYRef.current = e.touches[0].clientY;
    const diff = currentYRef.current - startYRef.current;

    // Only activate pull-to-refresh when pulling down and at top
    if (diff > 10 && isAtTop()) {
      isPullingRef.current = true;
      // Apply resistance - the further you pull, the harder it gets
      const resistance = 0.4;
      const adjustedPull = Math.min(diff * resistance, maxPull);
      setPullDistance(adjustedPull);
      setShowIndicator(true);

      // Prevent default scrolling while pulling
      if (adjustedPull > 5) {
        e.preventDefault();
      }
    } else if (diff < 0) {
      // User is scrolling up, reset
      isPullingRef.current = false;
      setPullDistance(0);
      setShowIndicator(false);
    }
  }, [disabled, isAtTop, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (disabled || isRefreshingRef.current) return;

    if (isPullingRef.current && pullDistance >= threshold) {
      // Trigger refresh
      setIsRefreshing(true);
      isRefreshingRef.current = true;
      setPullDistance(threshold * 0.6); // Snap to a smaller position during refresh

      try {
        await onRefresh();
      } catch (err) {
        console.error('Pull-to-refresh error:', err);
      } finally {
        setIsRefreshing(false);
        isRefreshingRef.current = false;
        setPullDistance(0);
        setShowIndicator(false);
      }
    } else {
      // Didn't pull far enough, snap back
      setPullDistance(0);
      setTimeout(() => setShowIndicator(false), 200);
    }

    isPullingRef.current = false;
    startYRef.current = 0;
    currentYRef.current = 0;
  }, [disabled, pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use passive: false for touchmove to allow preventDefault
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / threshold, 1);
  const isPastThreshold = pullDistance >= threshold;

  return (
    <div ref={containerRef} className="relative pull-to-refresh-container">
      {/* Pull indicator */}
      {showIndicator && (
        <div
          className="ptr-indicator-wrapper"
          style={{
            height: `${pullDistance}px`,
            transition: isPullingRef.current ? 'none' : 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
          }}
        >
          <div className="ptr-indicator">
            <div
              className={`ptr-icon-container ${isRefreshing ? 'ptr-spinning' : ''}`}
              style={{
                opacity: Math.min(progress * 1.5, 1),
                transform: isRefreshing
                  ? 'none'
                  : `rotate(${progress * 360}deg) scale(${0.5 + progress * 0.5})`,
              }}
            >
              <RefreshCw className="w-5 h-5" />
            </div>
            <span
              className="ptr-text"
              style={{ opacity: Math.min(progress * 1.5, 1) }}
            >
              {isRefreshing
                ? 'Refreshing...'
                : isPastThreshold
                  ? 'Release to refresh'
                  : 'Pull down to refresh'}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div
        style={{
          transform: showIndicator ? `translateY(${Math.max(pullDistance - (showIndicator ? 0 : 0), 0) * 0.15}px)` : 'none',
          transition: isPullingRef.current ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
