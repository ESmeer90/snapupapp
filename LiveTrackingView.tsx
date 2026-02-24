import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  getOrder, getOrderTracking, pollCourierTracking, formatZAR, timeAgo,
} from '@/lib/api';
import type { Order, OrderTracking, TrackingStatus } from '@/types';
import { TRACKING_STATUS_CONFIG } from '@/types';
import TrackingTimeline from './TrackingTimeline';
import DeliveryPhotoConfirmation from './DeliveryPhotoConfirmation';
import {
  ArrowLeft, Package, Truck, Loader2, CheckCircle2, AlertTriangle,
  RefreshCw, Clock, Shield, Satellite, Radio, Wifi, WifiOff,
  Camera, MapPin, Calendar, User, ChevronRight, Activity
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface LiveTrackingViewProps {
  orderId: string;
  onBack: () => void;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const LiveTrackingView: React.FC<LiveTrackingViewProps> = ({ orderId, onBack }) => {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState<OrderTracking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollingNow, setPollingNow] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);
  const [realtimeConnected, setRealtimeConnected] = useState(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const [orderData, trackingData] = await Promise.all([
        getOrder(orderId),
        getOrderTracking(orderId),
      ]);
      if (!orderData) throw new Error('Order not found');
      setOrder(orderData);
      setTracking(trackingData);
    } catch (err: any) {
      setError(err.message || 'Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscription
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`live-tracking-${orderId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'order_tracking',
        filter: `order_id=eq.${orderId}`,
      }, (payload) => {
        const newTracking = payload.new as OrderTracking;
        setTracking(prev => {
          if (prev.some(t => t.id === newTracking.id)) return prev;
          return [...prev, newTracking];
        });

        const hasPhoto = !!newTracking.photo_url;
        toast({
          title: hasPhoto ? 'Delivery Photo Received' : 'Tracking Updated',
          description: hasPhoto
            ? `Status: ${newTracking.status} — Delivery photo proof uploaded`
            : `Status: ${newTracking.status}${newTracking.notes ? ` — ${newTracking.notes}` : ''}`,
          duration: 8000,
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      }, (payload) => {
        const updated = payload.new as any;
        setOrder(prev => prev ? { ...prev, ...updated } : prev);
      })
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  // Auto-polling for shipped orders
  const isShippedOrder = order && ['shipped'].includes(order.status);

  const handlePollNow = useCallback(async () => {
    setPollingNow(true);
    try {
      const result = await pollCourierTracking();
      setLastPolledAt(new Date());
      setCountdown(POLL_INTERVAL_MS / 1000);

      // Reload data
      const [orderData, trackingData] = await Promise.all([
        getOrder(orderId),
        getOrderTracking(orderId),
      ]);
      if (orderData) setOrder(orderData);
      if (trackingData) setTracking(trackingData);

      const updated = result?.updated || result?.updated_count || 0;
      toast({
        title: 'Courier Polled',
        description: updated > 0
          ? `${updated} shipment(s) updated with new tracking info.`
          : 'All shipments are up to date.',
      });
    } catch (err: any) {
      toast({
        title: 'Poll Failed',
        description: err.message || 'Could not reach courier API.',
        variant: 'destructive',
      });
    } finally {
      setPollingNow(false);
    }
  }, [orderId]);

  // Set up auto-polling interval
  useEffect(() => {
    if (!orderId || !isShippedOrder) return;

    pollIntervalRef.current = setInterval(() => {
      handlePollNow();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [orderId, isShippedOrder, handlePollNow]);

  // Countdown timer
  useEffect(() => {
    if (!isShippedOrder) return;

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return POLL_INTERVAL_MS / 1000;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isShippedOrder]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Get delivery photos from tracking
  const deliveryPhotos = tracking.filter(t => t.photo_url);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading live tracking...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Tracking unavailable</h3>
        <p className="text-gray-500 mb-4 text-sm">{error || 'Could not load tracking data.'}</p>
        <button onClick={onBack} className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all inline-flex items-center gap-2 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
    );
  }

  const latestTracking = tracking.length > 0 ? tracking[tracking.length - 1] : null;
  const currentStatus = latestTracking?.status || 'Pending';
  const isBuyer = order.buyer_id === user?.id;

  const statusSteps: { status: TrackingStatus; label: string }[] = [
    { status: 'Pending', label: 'Ordered' },
    { status: 'Processing', label: 'Processing' },
    { status: 'Shipped', label: 'Shipped' },
    { status: 'In Transit', label: 'In Transit' },
    { status: 'Out for Delivery', label: 'Out for Delivery' },
    { status: 'Delivered', label: 'Delivered' },
  ];
  const statusOrder: TrackingStatus[] = statusSteps.map(s => s.status);
  const currentIdx = statusOrder.indexOf(currentStatus);

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Radio className="w-5 h-5 text-blue-600" />
            Live Delivery Tracking
          </h2>
          <p className="text-sm text-gray-500 font-mono">#{order.id.slice(0, 12).toUpperCase()}</p>
        </div>
        <div className="flex items-center gap-2">
          {realtimeConnected ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700">Live</span>
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg">
              <WifiOff className="w-3.5 h-3.5 text-red-600" />
              <span className="text-xs font-medium text-red-700">Offline</span>
            </div>
          )}
          <button onClick={loadData} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Order Summary Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
            <img
              src={order.listing_image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=200&fit=crop'}
              alt={order.listing_title || 'Item'}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900 truncate">{order.listing_title || 'Item'}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                TRACKING_STATUS_CONFIG[currentStatus]?.bgColor || 'bg-gray-100'
              } ${TRACKING_STATUS_CONFIG[currentStatus]?.color || 'text-gray-700'}`}>
                {currentStatus}
              </span>
              <span className="text-xs text-gray-500">{formatZAR(order.total)}</span>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {isBuyer ? order.seller_name : order.buyer_name || 'User'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(order.created_at).toLocaleDateString('en-ZA')}
              </span>
              {order.tracking_number && (
                <span className="flex items-center gap-1 font-mono text-blue-600">
                  <Package className="w-3 h-3" />
                  {order.tracking_number}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Poll Status Bar */}
      {isShippedOrder && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200 p-4 mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                <Satellite className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-indigo-800">Auto-Polling Active</h4>
                <p className="text-xs text-indigo-600">
                  Checking courier API every 5 minutes
                  {lastPolledAt && (
                    <span className="ml-1">
                      · Last: {lastPolledAt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Countdown */}
              <div className="text-center">
                <div className="text-lg font-mono font-bold text-indigo-700">{formatCountdown(countdown)}</div>
                <p className="text-[10px] text-indigo-500">Next poll</p>
              </div>
              {/* Poll Now Button */}
              <button
                onClick={handlePollNow}
                disabled={pollingNow}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                {pollingNow ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Polling...
                  </>
                ) : (
                  <>
                    <Satellite className="w-4 h-4" />
                    Poll Now
                  </>
                )}
              </button>
            </div>
          </div>
          {/* Progress bar for countdown */}
          <div className="mt-3 h-1 bg-indigo-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(1 - countdown / (POLL_INTERVAL_MS / 1000)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Large Progress Steps */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-5 flex items-center gap-2">
          <Truck className="w-4 h-4 text-blue-600" /> Delivery Progress
        </h4>

        {currentStatus === 'Cancelled' || currentStatus === 'Returned' ? (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${TRACKING_STATUS_CONFIG[currentStatus]?.bgColor}`}>
            <AlertTriangle className={`w-5 h-5 ${TRACKING_STATUS_CONFIG[currentStatus]?.color}`} />
            <span className={`font-medium ${TRACKING_STATUS_CONFIG[currentStatus]?.color}`}>{currentStatus}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between relative px-2">
            <div className="absolute top-5 left-6 right-6 h-1 bg-gray-200 rounded-full" />
            <div
              className="absolute top-5 left-6 h-1 bg-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, (currentIdx / (statusSteps.length - 1)) * 100)}%`, maxWidth: 'calc(100% - 48px)' }}
            />
            {statusSteps.map((step, idx) => {
              const isComplete = currentIdx >= idx;
              const isCurrent = currentIdx === idx;
              return (
                <div key={step.status} className="flex flex-col items-center relative z-10">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isComplete
                      ? isCurrent
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100 shadow-lg shadow-blue-200'
                        : 'bg-blue-500 text-white'
                      : 'bg-white border-2 border-gray-300 text-gray-400'
                  }`}>
                    {isComplete ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                  </div>
                  <span className={`text-[10px] sm:text-xs mt-2 font-medium whitespace-nowrap ${isComplete ? 'text-blue-600' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                  {isCurrent && (
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse mt-1" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Status Description */}
        {TRACKING_STATUS_CONFIG[currentStatus] && (
          <div className={`mt-5 px-4 py-3 rounded-xl ${TRACKING_STATUS_CONFIG[currentStatus].bgColor}`}>
            <p className={`text-sm font-medium ${TRACKING_STATUS_CONFIG[currentStatus].color}`}>
              {TRACKING_STATUS_CONFIG[currentStatus].description}
            </p>
          </div>
        )}
      </div>

      {/* Tracking Timeline */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-600" /> Tracking History
          </h4>
          <span className="text-xs text-gray-400">{tracking.length} update{tracking.length !== 1 ? 's' : ''}</span>
        </div>
        <TrackingTimeline
          tracking={tracking}
          trackingNumber={order.tracking_number}
          carrier={order.carrier}
        />
      </div>

      {/* Delivery Photos Gallery */}
      {deliveryPhotos.length > 0 && (
        <div className="mb-6 space-y-4">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-600" />
            Delivery Photos ({deliveryPhotos.length})
          </h4>
          {deliveryPhotos.map((photo) => (
            <DeliveryPhotoConfirmation
              key={photo.id}
              photoUrl={photo.photo_url!}
              uploadedAt={photo.created_at}
              orderId={order.id}
              status={photo.status}
              uploaderName={photo.updated_by === order.seller_id ? 'Seller' : 'Buyer'}
            />
          ))}
        </div>
      )}

      {/* Carrier Info */}
      {(order.carrier || order.tracking_number) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" /> Carrier Information
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {order.carrier && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-0.5">Courier</p>
                <p className="text-sm font-semibold text-gray-900">{order.carrier}</p>
              </div>
            )}
            {order.tracking_number && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-0.5">Tracking Number</p>
                <p className="text-sm font-mono font-semibold text-blue-600">{order.tracking_number}</p>
              </div>
            )}
            {order.courier_service && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-0.5">Service</p>
                <p className="text-sm font-semibold text-gray-900">{order.courier_service}</p>
              </div>
            )}
            {order.shipment_id && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-0.5">Shipment ID</p>
                <p className="text-sm font-mono text-gray-700">{order.shipment_id}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* POPIA Notice */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
        <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Tracking data is handled per POPIA. Location information is only used for delivery purposes and is not shared with third parties.
        </p>
      </div>
    </section>
  );
};

export default LiveTrackingView;
