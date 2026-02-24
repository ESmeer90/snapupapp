import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  getOrder, getOrderTracking, addTrackingUpdate, updateOrderStatus,
  formatZAR, timeAgo, uploadDeliveryPhoto, createLocalPreview, revokeLocalPreview,
  pollCourierTracking, getOrderDispute
} from '@/lib/api';
import type { Order, OrderTracking, TrackingStatus } from '@/types';
import { SA_CARRIERS, TRACKING_STATUSES, TRACKING_STATUS_CONFIG } from '@/types';
import TrackingTimeline from './TrackingTimeline';
import DeliveryPhotoConfirmation from './DeliveryPhotoConfirmation';
import BuyerDeliveryConfirmModal from './BuyerDeliveryConfirmModal';
import EscrowCountdownTimer from './EscrowCountdownTimer';
import OrderLifecycleTimeline from './OrderLifecycleTimeline';

import {
  ArrowLeft, Package, Truck, CreditCard, Shield, Loader2, CheckCircle2,
  AlertTriangle, RefreshCw, MapPin, Calendar, DollarSign, User,
  FileText, Clock, Flag, Star, X, ChevronRight, Camera, Trash2, Upload,
  Satellite, Radio, Wifi, WifiOff, Activity, Share2, Copy, ExternalLink
} from 'lucide-react';

import { toast } from '@/components/ui/use-toast';


interface OrderDetailViewProps {
  orderId: string;
  onBack: () => void;
  onOpenDispute?: (orderId: string, title: string, amount: number, image?: string) => void;
  onRateSeller?: (orderId: string, sellerId: string, sellerName: string) => void;
  onOpenLiveTracking?: (orderId: string) => void;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const OrderDetailView: React.FC<OrderDetailViewProps> = ({
  orderId, onBack, onOpenDispute, onRateSeller, onOpenLiveTracking
}) => {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState<OrderTracking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Seller shipping form
  const [showShippingForm, setShowShippingForm] = useState(false);
  const [shippingStatus, setShippingStatus] = useState<TrackingStatus>('Processing');
  const [shippingCarrier, setShippingCarrier] = useState('');
  const [shippingTrackingNumber, setShippingTrackingNumber] = useState('');
  const [shippingEstDate, setShippingEstDate] = useState('');
  const [shippingNotes, setShippingNotes] = useState('');
  const [submittingShipping, setSubmittingShipping] = useState(false);

  // Delivery photo for inline form
  const [shippingPhotoFile, setShippingPhotoFile] = useState<File | null>(null);
  const [shippingPhotoPreview, setShippingPhotoPreview] = useState<string | null>(null);
  const [uploadingShippingPhoto, setUploadingShippingPhoto] = useState(false);
  const shippingPhotoInputRef = useRef<HTMLInputElement>(null);

  // Buyer confirm delivery modal
  const [showDeliveryConfirmModal, setShowDeliveryConfirmModal] = useState(false);



  // Realtime connection status
  const [realtimeConnected, setRealtimeConnected] = useState(true);

  // Recently uploaded delivery photo confirmation
  const [recentPhotoConfirmation, setRecentPhotoConfirmation] = useState<{
    url: string;
    uploadedAt: string;
    status: string;
  } | null>(null);

  const loadOrder = useCallback(async () => {
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

      // Pre-fill shipping form
      if (orderData.carrier) setShippingCarrier(orderData.carrier);
      if (orderData.tracking_number) setShippingTrackingNumber(orderData.tracking_number);
      const latestStatus = trackingData.length > 0 ? trackingData[trackingData.length - 1].status : 'Processing';
      setShippingStatus(latestStatus as TrackingStatus);
    } catch (err: any) {
      setError(err.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // Real-time subscription on order_tracking and orders
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order-detail-${orderId}`)
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
          title: hasPhoto ? 'Delivery Photo Uploaded' : 'Tracking Updated',
          description: hasPhoto
            ? `Status: ${newTracking.status} — Delivery photo proof attached`
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
        const oldStatus = order?.status;
        setOrder(prev => prev ? { ...prev, ...updated } : prev);

        // Show toast for status changes
        if (updated.status && updated.status !== oldStatus) {
          const statusLabels: Record<string, string> = {
            paid: 'Payment Confirmed',
            shipped: 'Order Shipped',
            delivered: 'Order Delivered',
            cancelled: 'Order Cancelled',
            refunded: 'Order Refunded',
          };
          const label = statusLabels[updated.status] || `Status: ${updated.status}`;
          toast({
            title: label,
            description: `Order status has been updated.`,
            variant: updated.status === 'cancelled' ? 'destructive' : undefined,
            duration: 6000,
          });
        }
      })
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, [orderId, order?.status]);


  // ===== 5-minute automatic courier tracking polling =====
  const [pollingNow, setPollingNow] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isShippedOrder = order && ['shipped'].includes(order.status);

  const handlePollNow = useCallback(async () => {
    setPollingNow(true);
    try {
      const result = await pollCourierTracking();
      setLastPolledAt(new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }));
      setCountdown(POLL_INTERVAL_MS / 1000);
      // Reload order data to pick up any tracking changes
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
          : 'Tracking status checked — all up to date.',
      });
    } catch (err: any) {
      console.error('Courier poll failed:', err);
      toast({
        title: 'Poll Failed',
        description: err.message || 'Could not reach courier API.',
        variant: 'destructive',
      });
    } finally {
      setPollingNow(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId || !isShippedOrder) return;
    // Poll every 5 minutes
    pollIntervalRef.current = setInterval(() => {
      handlePollNow();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [orderId, isShippedOrder, handlePollNow]);

  // Countdown timer for shipped orders
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


  const showPhotoUploadInForm = ['Out for Delivery', 'Delivered'].includes(shippingStatus);

  const handleShippingPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Please select a JPEG, PNG, or WebP image.', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please select an image smaller than 10MB.', variant: 'destructive' });
      return;
    }

    if (shippingPhotoPreview) revokeLocalPreview(shippingPhotoPreview);
    setShippingPhotoFile(file);
    setShippingPhotoPreview(createLocalPreview(file));
  };

  const handleRemoveShippingPhoto = () => {
    if (shippingPhotoPreview) revokeLocalPreview(shippingPhotoPreview);
    setShippingPhotoFile(null);
    setShippingPhotoPreview(null);
    if (shippingPhotoInputRef.current) shippingPhotoInputRef.current.value = '';
  };

  const handleSubmitShipping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !order) return;

    setSubmittingShipping(true);
    try {
      let photoUrl: string | undefined;

      // Upload delivery photo if one was selected
      if (shippingPhotoFile && showPhotoUploadInForm) {
        setUploadingShippingPhoto(true);
        try {
          photoUrl = await uploadDeliveryPhoto(shippingPhotoFile, order.id);
        } catch (photoErr: any) {
          console.error('Delivery photo upload failed:', photoErr);
          toast({
            title: 'Photo Upload Warning',
            description: `Tracking will be updated without photo: ${photoErr.message || 'Upload failed'}`,
            variant: 'destructive',
          });
        } finally {
          setUploadingShippingPhoto(false);
        }
      }

      const newTracking = await addTrackingUpdate({
        order_id: order.id,
        status: shippingStatus,
        tracking_number: shippingTrackingNumber.trim() || undefined,
        carrier: shippingCarrier || undefined,
        notes: [shippingNotes.trim(), shippingEstDate ? `Est. delivery: ${shippingEstDate}` : ''].filter(Boolean).join('. ') || undefined,
        photo_url: photoUrl,
        updated_by: user.id,
      });

      setTracking(prev => [...prev, newTracking]);
      setOrder(prev => prev ? {
        ...prev,
        tracking_status: shippingStatus,
        tracking_number: shippingTrackingNumber.trim() || prev.tracking_number,
        carrier: shippingCarrier || prev.carrier,
        status: shippingStatus === 'Delivered' ? 'delivered' :
                ['Shipped', 'In Transit', 'Out for Delivery'].includes(shippingStatus) ? 'shipped' : prev.status,
      } : prev);

      // Show delivery photo confirmation if photo was uploaded
      if (photoUrl) {
        setRecentPhotoConfirmation({
          url: photoUrl,
          uploadedAt: new Date().toISOString(),
          status: shippingStatus,
        });
      }

      // Clean up photo
      if (shippingPhotoPreview) revokeLocalPreview(shippingPhotoPreview);
      setShippingPhotoFile(null);
      setShippingPhotoPreview(null);

      setShowShippingForm(false);
      toast({
        title: 'Tracking Updated',
        description: `Order status updated to "${shippingStatus}"${photoUrl ? ' with delivery photo proof' : ''}`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update tracking', variant: 'destructive' });
    } finally {
      setSubmittingShipping(false);
      setUploadingShippingPhoto(false);
    }
  };

  // Open the delivery confirmation modal with photo upload
  const handleConfirmDelivery = () => {
    if (!user || !order) return;
    setShowDeliveryConfirmModal(true);
  };

  // Callback when buyer confirms delivery (with or without photo) from the modal
  const handleDeliveryConfirmed = (photoUrl?: string) => {
    setShowDeliveryConfirmModal(false);
    setOrder(prev => prev ? { ...prev, status: 'delivered', tracking_status: 'Delivered' } : prev);

    // If a photo was uploaded, show the photo confirmation card
    if (photoUrl) {
      setRecentPhotoConfirmation({
        url: photoUrl,
        uploadedAt: new Date().toISOString(),
        status: 'Delivered',
      });
    }

    // Reload tracking to get the new entry
    if (order) {
      getOrderTracking(order.id).then(trackingData => {
        setTracking(trackingData);
      }).catch(() => {});
    }
  };



  // Determine available statuses for seller
  const getAvailableStatuses = (): TrackingStatus[] => {
    const statusOrder: TrackingStatus[] = ['Pending', 'Processing', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered'];
    const currentStatus = tracking.length > 0 ? tracking[tracking.length - 1].status : 'Pending';
    const currentIdx = statusOrder.indexOf(currentStatus);
    const available = statusOrder.filter((_, idx) => idx >= currentIdx);
    if (!available.includes('Cancelled')) available.push('Cancelled');
    return available.length > 0 ? available : TRACKING_STATUSES;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Order not found</h3>
        <p className="text-gray-500 mb-4 text-sm">{error || 'Could not load this order.'}</p>
        <button onClick={onBack} className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all inline-flex items-center gap-2 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to Orders
        </button>
      </div>
    );
  }

  const isBuyer = order.buyer_id === user?.id;
  const isSeller = order.seller_id === user?.id;
  const latestTracking = tracking.length > 0 ? tracking[tracking.length - 1] : null;
  const canSellerUpdate = isSeller && !['delivered', 'cancelled', 'refunded'].includes(order.status);
  const canBuyerConfirm = isBuyer && order.status === 'shipped';
  const canBuyerDispute = isBuyer && ['paid', 'shipped', 'delivered'].includes(order.status);
  const canBuyerRate = isBuyer && order.status === 'delivered';

  const statusSteps: { status: TrackingStatus; label: string }[] = [
    { status: 'Pending', label: 'Ordered' },
    { status: 'Processing', label: 'Processing' },
    { status: 'Shipped', label: 'Shipped' },
    { status: 'In Transit', label: 'In Transit' },
    { status: 'Out for Delivery', label: 'Out for Delivery' },
    { status: 'Delivered', label: 'Delivered' },
  ];

  const statusOrder: TrackingStatus[] = statusSteps.map(s => s.status);
  const currentTrackingStatus = latestTracking?.status || 'Pending';
  const currentIdx = statusOrder.indexOf(currentTrackingStatus);

  // Get delivery photos from tracking
  const deliveryPhotos = tracking.filter(t => t.photo_url);

  // Escrow countdown: find when delivery was confirmed by buyer (status 'Delivered' with buyer's photo)
  const deliveryConfirmEntry = tracking.find(t =>
    t.status === 'Delivered' && t.notes?.includes('Delivery confirmed by buyer')
  );
  const deliveryConfirmedAt = deliveryConfirmEntry?.created_at
    || (order.status === 'delivered' ? (tracking.find(t => t.status === 'Delivered')?.created_at || order.updated_at) : null);
  const hasDeliveryPhoto = deliveryPhotos.length > 0;
  const showEscrowTimer = order.status === 'delivered' && !!deliveryConfirmedAt;

  return (
    <div className="space-y-6">
      {/* Back Button + Header */}

      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">Order Details</h2>
          <p className="text-sm text-gray-500 font-mono">#{order.id.slice(0, 12).toUpperCase()}</p>
        </div>
        <div className="flex items-center gap-2">
          {realtimeConnected ? (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Wifi className="w-3 h-3 text-emerald-600" />
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-medium text-emerald-700">Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded-lg">
              <WifiOff className="w-3 h-3 text-red-600" />
              <span className="text-[10px] font-medium text-red-700">Offline</span>
            </div>
          )}
        </div>
        {/* Poll Now button — visible for shipped orders */}
        {isShippedOrder && (
          <button
            onClick={handlePollNow}
            disabled={pollingNow}
            className="flex items-center gap-1.5 px-3 py-2 text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all disabled:opacity-50"
            title={lastPolledAt ? `Last polled: ${lastPolledAt}` : 'Poll courier for tracking updates'}
          >
            {pollingNow ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Satellite className="w-4 h-4" />
            )}
            <span className="text-xs font-semibold hidden sm:inline">
              {pollingNow ? 'Polling...' : 'Poll Now'}
            </span>
            {lastPolledAt && !pollingNow && (
              <span className="text-[9px] text-indigo-400 hidden md:inline ml-0.5">{lastPolledAt}</span>
            )}
          </button>
        )}
        <button onClick={loadOrder} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>


      {/* Order Details Card */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-start gap-4 p-5">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
            <img
              src={order.listing_image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=200&fit=crop'}
              alt={order.listing_title || 'Item'}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900">{order.listing_title || 'Item'}</h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${
                isBuyer ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {isBuyer ? 'Purchase' : 'Sale'}
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${
                TRACKING_STATUS_CONFIG[currentTrackingStatus]?.bgColor || 'bg-gray-100'
              } ${TRACKING_STATUS_CONFIG[currentTrackingStatus]?.color || 'text-gray-700'}`}>
                {currentTrackingStatus}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{isBuyer ? order.seller_name : order.buyer_name || 'User'}</span>
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{new Date(order.created_at).toLocaleDateString('en-ZA')}</span>
            </div>
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="border-t border-gray-100 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" /> Price Breakdown
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Item Price</span>
              <span className="font-medium text-gray-900">{formatZAR(order.amount)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Service Fee (2.5%)</span>
              <span className="font-medium text-gray-500">{formatZAR(order.service_fee)}</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="text-lg font-bold text-emerald-600">{formatZAR(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Payment Info */}
        <div className="border-t border-gray-100 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-600" /> Payment Information
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Method</p>
              <p className="text-sm font-medium text-gray-900">{order.payment_method || 'PayFast'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">PayFast Reference</p>
              <p className="text-sm font-mono font-medium text-gray-900">{order.payfast_payment_id || order.payment_id || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Order Lifecycle Timeline - shows timestamps for each stage */}
      <OrderLifecycleTimeline order={order} tracking={tracking} isBuyer={isBuyer} />


      {/* Auto-Poll Status Bar (for shipped orders) */}
      {isShippedOrder && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                <Satellite className="w-4.5 h-4.5 text-indigo-600" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-indigo-800">Auto-Polling Active</h4>
                <p className="text-[11px] text-indigo-600">
                  Checking courier every 5 min
                  {lastPolledAt && <span> · Last: {lastPolledAt}</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-base font-mono font-bold text-indigo-700">{formatCountdown(countdown)}</div>
                <p className="text-[9px] text-indigo-500">Next poll</p>
              </div>
              <button
                onClick={handlePollNow}
                disabled={pollingNow}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all text-xs shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                {pollingNow ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Polling...</>
                ) : (
                  <><Satellite className="w-3.5 h-3.5" /> Poll Now</>
                )}
              </button>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-1 bg-indigo-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(1 - countdown / (POLL_INTERVAL_MS / 1000)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Open Live Tracking Button */}
      {onOpenLiveTracking && ['shipped', 'paid'].includes(order.status) && (
        <button
          onClick={() => onOpenLiveTracking(order.id)}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-white hover:from-blue-700 hover:to-indigo-700 transition-all group shadow-lg shadow-blue-200"
        >
          <div className="flex items-center gap-3">
            <Radio className="w-5 h-5" />
            <div className="text-left">
              <span className="text-sm font-bold block">Open Live Tracking</span>
              <span className="text-[11px] text-blue-200">Full-screen tracking with auto-updates</span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* Visual Status Steps */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Truck className="w-4 h-4 text-blue-600" /> Delivery Progress
        </h4>

        {currentTrackingStatus === 'Cancelled' || currentTrackingStatus === 'Returned' ? (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${TRACKING_STATUS_CONFIG[currentTrackingStatus].bgColor}`}>
            <AlertTriangle className={`w-5 h-5 ${TRACKING_STATUS_CONFIG[currentTrackingStatus].color}`} />
            <span className={`font-medium ${TRACKING_STATUS_CONFIG[currentTrackingStatus].color}`}>{currentTrackingStatus}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between relative px-2">
            <div className="absolute top-4 left-6 right-6 h-0.5 bg-gray-200" />
            <div className="absolute top-4 left-6 h-0.5 bg-blue-500 transition-all duration-500"
              style={{ width: `${Math.min(100, (currentIdx / (statusSteps.length - 1)) * 100)}%`, maxWidth: 'calc(100% - 48px)' }} />
            {statusSteps.map((step, idx) => {
              const isComplete = currentIdx >= idx;
              const isCurrent = currentIdx === idx;
              return (
                <div key={step.status} className="flex flex-col items-center relative z-10">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isComplete
                      ? isCurrent
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100 shadow-lg'
                        : 'bg-blue-500 text-white'
                      : 'bg-white border-2 border-gray-300 text-gray-400'
                  }`}>
                    {isComplete ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                  </div>
                  <span className={`text-[10px] sm:text-xs mt-2 font-medium whitespace-nowrap ${isComplete ? 'text-blue-600' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                  {isCurrent && (
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Auto-polling info banner below delivery progress for shipped orders */}
      {isShippedOrder && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50/70 border border-indigo-100 rounded-xl">
          <div className="flex items-center gap-1.5">
            <Satellite className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-medium text-indigo-700">Auto-polling courier every 5 min</span>
          </div>
          {lastPolledAt && (
            <span className="text-[10px] text-indigo-400 ml-auto flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last polled: {lastPolledAt}
            </span>
          )}
          {!lastPolledAt && (
            <span className="text-[10px] text-indigo-400 ml-auto">Waiting for first poll...</span>
          )}
        </div>
      )}


      {/* Recent Delivery Photo Confirmation */}
      {recentPhotoConfirmation && (
        <DeliveryPhotoConfirmation
          photoUrl={recentPhotoConfirmation.url}
          uploadedAt={recentPhotoConfirmation.uploadedAt}
          orderId={order.id}
          status={recentPhotoConfirmation.status}
          uploaderName={isSeller ? 'You (Seller)' : 'You (Buyer)'}
          onDismiss={() => setRecentPhotoConfirmation(null)}
        />
      )}

      {/* Delivery Photos from Tracking */}
      {deliveryPhotos.length > 0 && !recentPhotoConfirmation && (
        <div className="space-y-3">
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
              uploaderName={photo.updated_by === order.seller_id ? 'Seller' : photo.updated_by === order.buyer_id ? 'Buyer' : 'System'}
            />
          ))}
        </div>
      )}

      {/* 48-Hour Escrow Countdown Timer */}
      {showEscrowTimer && (
        <EscrowCountdownTimer
          orderId={order.id}
          deliveryConfirmedAt={deliveryConfirmedAt}
          hasDeliveryPhoto={hasDeliveryPhoto}
          isBuyer={isBuyer}
          isSeller={isSeller}
          orderStatus={order.status}
          orderAmount={order.amount}
          onPayoutReleased={loadOrder}
        />
      )}


      {/* Tracking Timeline */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-600" /> Tracking History
          </h4>
          <div className="flex items-center gap-2">
            {isShippedOrder && (
              <button
                onClick={handlePollNow}
                disabled={pollingNow}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 disabled:opacity-50"
              >
                {pollingNow ? <Loader2 className="w-3 h-3 animate-spin" /> : <Satellite className="w-3 h-3" />}
                Poll
              </button>
            )}
            {canSellerUpdate && (
              <button onClick={() => setShowShippingForm(!showShippingForm)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1">
                <Truck className="w-3 h-3" />
                {showShippingForm ? 'Hide Form' : 'Update Tracking'}
              </button>
            )}
          </div>
        </div>

        <TrackingTimeline
          tracking={tracking}
          trackingNumber={order.tracking_number}
          carrier={order.carrier}
        />
      </div>

      {/* Share Public Tracking Link */}
      {['paid', 'shipped', 'delivered'].includes(order.status) && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                <Share2 className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-blue-800">Public Tracking Link</h4>
                <p className="text-[11px] text-blue-600">Share this link to let anyone track this order (no login required)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const url = `${window.location.origin}/track?q=${order.id}`;
                  navigator.clipboard.writeText(url).then(() => {
                    toast({ title: 'Link Copied', description: 'Public tracking link copied to clipboard.' });
                  }).catch(() => {
                    toast({ title: 'Copy Failed', description: 'Could not copy link.', variant: 'destructive' });
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-blue-50 text-blue-700 font-medium rounded-xl text-xs border border-blue-200 transition-all"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Link
              </button>
              <a
                href={`/track?q=${order.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-xs transition-all shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open
              </a>
            </div>
          </div>
        </div>
      )}


      {/* Seller Shipping Form */}
      {canSellerUpdate && showShippingForm && (
        <div className="bg-white rounded-2xl border-2 border-blue-200 p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" /> Update Shipping Details
          </h4>

          <form onSubmit={handleSubmitShipping} className="space-y-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Status <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {getAvailableStatuses().map((s) => (
                  <button key={s} type="button" onClick={() => setShippingStatus(s)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border-2 transition-all text-left ${
                      shippingStatus === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    <Package className="w-3.5 h-3.5 flex-shrink-0" />{s}
                  </button>
                ))}
              </div>
            </div>

            {/* Courier */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Courier / Carrier</label>
              <select value={shippingCarrier} onChange={(e) => setShippingCarrier(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                <option value="">Select courier...</option>
                {SA_CARRIERS.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>

            {/* Tracking Number */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tracking Number</label>
              <input type="text" value={shippingTrackingNumber} onChange={(e) => setShippingTrackingNumber(e.target.value)}
                placeholder="e.g., TCG12345678" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>

            {/* Estimated Delivery Date */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Estimated Delivery Date</label>
              <input type="date" value={shippingEstDate} onChange={(e) => setShippingEstDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>

            {/* Delivery Photo Upload */}
            {showPhotoUploadInForm && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <Camera className="w-3.5 h-3.5 inline mr-1" />
                  Delivery Photo Proof
                  <span className="text-gray-400 text-xs ml-1 font-normal">(optional)</span>
                </label>

                {!shippingPhotoPreview ? (
                  <div
                    onClick={() => shippingPhotoInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
                  >
                    <Camera className="w-8 h-8 mx-auto mb-2 text-gray-400 group-hover:text-blue-500 transition-colors" />
                    <p className="text-sm font-medium text-gray-600 group-hover:text-blue-600">Add delivery photo</p>
                    <p className="text-xs text-gray-400 mt-1">JPEG, PNG, or WebP (max 10MB)</p>
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border-2 border-emerald-200">
                    <img src={shippingPhotoPreview} alt="Delivery photo" className="w-full h-36 object-cover" />
                    <button type="button" onClick={handleRemoveShippingPhoto}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-white text-xs">{shippingPhotoFile?.name}</span>
                      </div>
                    </div>
                  </div>
                )}

                <input ref={shippingPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={handleShippingPhotoSelect} className="hidden" />

                {shippingStatus === 'Delivered' && (
                  <p className="text-xs text-emerald-600 mt-1.5 bg-emerald-50 rounded-lg px-2.5 py-1.5">
                    Delivery photos serve as proof and help resolve disputes.
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                <FileText className="w-3.5 h-3.5 inline mr-1" />Notes (optional)
              </label>
              <textarea value={shippingNotes} onChange={(e) => setShippingNotes(e.target.value)}
                placeholder="Add notes about this shipment..." rows={2} maxLength={500}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" />
            </div>

            {/* Upload Progress */}
            {uploadingShippingPhoto && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
                <span className="text-sm text-blue-700 font-medium">Uploading delivery photo...</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button type="button" onClick={() => setShowShippingForm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button type="submit" disabled={submittingShipping}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2">
                {submittingShipping ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {uploadingShippingPhoto ? 'Uploading Photo...' : 'Updating...'}
                  </>
                ) : (
                  <>
                    {showPhotoUploadInForm && shippingPhotoFile ? <Upload className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    {showPhotoUploadInForm && shippingPhotoFile ? 'Update with Photo' : 'Update Tracking'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Buyer Actions */}
      {(canBuyerConfirm || canBuyerDispute || canBuyerRate) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">Actions</h4>
          <div className="space-y-3">
            {canBuyerConfirm && (
              <button onClick={handleConfirmDelivery}
                className="w-full flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 rounded-2xl text-white hover:from-emerald-700 hover:to-green-700 transition-all group shadow-lg shadow-emerald-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold block">Confirm Delivery</span>
                    <span className="text-[11px] text-emerald-200">Add photo proof for secure confirmation</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              {canBuyerDispute && onOpenDispute && (
                <button onClick={() => onOpenDispute(order.id, order.listing_title || 'Order', order.amount, order.listing_image || undefined)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-xl transition-all">
                  <Flag className="w-4 h-4" /> Report Issue / Dispute
                </button>
              )}
              {canBuyerRate && onRateSeller && (
                <button onClick={() => onRateSeller(order.id, order.seller_id, order.seller_name || 'Seller')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-xl transition-all">
                  <Star className="w-4 h-4" /> Rate Seller
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POPIA Notice */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
        <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Order data is handled per POPIA. Personal information is minimized and only shared as necessary for order fulfillment.
        </p>
      </div>

      {/* Buyer Delivery Confirmation Modal with Photo Upload */}
      {showDeliveryConfirmModal && user && (
        <BuyerDeliveryConfirmModal
          orderId={order.id}
          userId={user.id}
          listingTitle={order.listing_title || 'Item'}
          listingImage={order.listing_image}
          onClose={() => setShowDeliveryConfirmModal(false)}
          onConfirmed={handleDeliveryConfirmed}
        />
      )}
    </div>

  );
};

export default OrderDetailView;
