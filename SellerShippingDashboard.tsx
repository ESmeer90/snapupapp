import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  getSellerOrders, createShipment, getDeliveryAddress, getOrderTracking,
  pollSingleOrderTracking, pollCourierTracking, formatZAR, timeAgo,
} from '@/lib/api';
import type { SellerOrder, OrderTracking } from '@/types';
import { TRACKING_STATUS_CONFIG } from '@/types';
import {
  Truck, Package, CheckCircle2, Clock, Loader2, RefreshCw,
  MapPin, AlertTriangle, ChevronDown, ChevronUp, Satellite,
  ArrowRight, Shield, ExternalLink, Tag,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import ShippingLabel from './ShippingLabel';

const PLACEHOLDER = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=150&fit=crop';

type ShippingFilter = 'all' | 'awaiting' | 'shipped' | 'in_transit' | 'delivered';

const SellerShippingDashboard: React.FC = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [trackingMap, setTrackingMap] = useState<Record<string, OrderTracking[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ShippingFilter>('all');
  const [creatingShipment, setCreatingShipment] = useState<string | null>(null);
  const [refreshingOrder, setRefreshingOrder] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [bulkPolling, setBulkPolling] = useState(false);
  const [showLabel, setShowLabel] = useState<SellerOrder | null>(null);
  const [deliveryAddresses, setDeliveryAddresses] = useState<Record<string, string | null>>({});

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const allOrders = await getSellerOrders(user.id);
      // Only show orders that are relevant to shipping (paid, shipped, delivered)
      const shippingOrders = allOrders.filter(o =>
        ['paid', 'shipped', 'delivered'].includes(o.status)
      );
      setOrders(shippingOrders);

      // Load tracking for shipped/delivered orders
      const trackingPromises = shippingOrders
        .filter(o => o.status === 'shipped' || o.status === 'delivered')
        .map(async (o) => {
          try {
            const tracking = await getOrderTracking(o.id);
            return { orderId: o.id, tracking };
          } catch {
            return { orderId: o.id, tracking: [] };
          }
        });
      const trackingResults = await Promise.all(trackingPromises);
      const newMap: Record<string, OrderTracking[]> = {};
      trackingResults.forEach(r => { newMap[r.orderId] = r.tracking; });
      setTrackingMap(newMap);

      // Load delivery addresses for paid orders
      const paidOrders = shippingOrders.filter(o => o.status === 'paid');
      const addrPromises = paidOrders.map(async (o) => {
        try {
          const addr = await getDeliveryAddress(o.id);
          return { orderId: o.id, address: addr };
        } catch {
          return { orderId: o.id, address: null };
        }
      });
      const addrResults = await Promise.all(addrPromises);
      const addrMap: Record<string, string | null> = {};
      addrResults.forEach(r => { addrMap[r.orderId] = r.address; });
      setDeliveryAddresses(addrMap);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to load shipping data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscription for order updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('seller-shipping-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `seller_id=eq.${user.id}`,
      }, () => { loadData(); })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'order_tracking',
      }, (payload) => {
        const newTracking = payload.new as any;
        if (newTracking?.order_id) {
          setTrackingMap(prev => ({
            ...prev,
            [newTracking.order_id]: [...(prev[newTracking.order_id] || []), newTracking],
          }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, loadData]);

  const handleCreateShipment = async (orderId: string) => {
    setCreatingShipment(orderId);
    try {
      const result = await createShipment({
        order_id: orderId,
        courier_service: 'ShipLogic',
      });
      toast({
        title: 'Shipment Created',
        description: `Tracking: ${result.tracking_number}${result.api_used ? '' : ' (simulated)'}`,
      });
      loadData();
    } catch (err: any) {
      toast({ title: 'Shipment Failed', description: err.message || 'Could not create shipment', variant: 'destructive' });
    } finally {
      setCreatingShipment(null);
    }
  };

  const handleRefreshTracking = async (orderId: string) => {
    setRefreshingOrder(orderId);
    try {
      const result = await pollSingleOrderTracking(orderId);
      if (result?.success) {
        toast({ title: 'Tracking Updated', description: `${result.prev || 'Current'} → ${result.new_status}` });
        loadData();
      } else {
        toast({ title: 'No Update', description: result?.message || 'Tracking is up to date' });
      }
    } catch (err: any) {
      toast({ title: 'Refresh Failed', description: err.message || 'Could not refresh tracking', variant: 'destructive' });
    } finally {
      setRefreshingOrder(null);
    }
  };

  const handleBulkPoll = async () => {
    setBulkPolling(true);
    try {
      const result = await pollCourierTracking();
      const updated = result?.updated || 0;
      toast({
        title: 'Bulk Poll Complete',
        description: updated > 0
          ? `${updated} shipment(s) updated`
          : 'All shipments are up to date',
      });
      if (updated > 0) loadData();
    } catch (err: any) {
      toast({ title: 'Poll Failed', description: err.message, variant: 'destructive' });
    } finally {
      setBulkPolling(false);
    }
  };

  // Filter orders
  const filteredOrders = orders.filter(o => {
    if (filter === 'all') return true;
    if (filter === 'awaiting') return o.status === 'paid';
    if (filter === 'shipped') return o.status === 'shipped' && (!o.tracking_status || o.tracking_status === 'Shipped');
    if (filter === 'in_transit') return o.status === 'shipped' && ['In Transit', 'Out for Delivery'].includes(o.tracking_status || '');
    if (filter === 'delivered') return o.status === 'delivered';
    return true;
  });

  // Summary counts
  const counts = {
    awaiting: orders.filter(o => o.status === 'paid').length,
    shipped: orders.filter(o => o.status === 'shipped' && (!o.tracking_status || o.tracking_status === 'Shipped')).length,
    in_transit: orders.filter(o => o.status === 'shipped' && ['In Transit', 'Out for Delivery'].includes(o.tracking_status || '')).length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading shipping dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Awaiting Shipment"
          count={counts.awaiting}
          icon={<Clock className="w-5 h-5" />}
          color="text-amber-600"
          bgColor="bg-amber-50 border-amber-200"
          active={filter === 'awaiting'}
          onClick={() => setFilter(filter === 'awaiting' ? 'all' : 'awaiting')}
        />
        <SummaryCard
          label="Shipped"
          count={counts.shipped}
          icon={<Truck className="w-5 h-5" />}
          color="text-blue-600"
          bgColor="bg-blue-50 border-blue-200"
          active={filter === 'shipped'}
          onClick={() => setFilter(filter === 'shipped' ? 'all' : 'shipped')}
        />
        <SummaryCard
          label="In Transit"
          count={counts.in_transit}
          icon={<Package className="w-5 h-5" />}
          color="text-indigo-600"
          bgColor="bg-indigo-50 border-indigo-200"
          active={filter === 'in_transit'}
          onClick={() => setFilter(filter === 'in_transit' ? 'all' : 'in_transit')}
        />
        <SummaryCard
          label="Delivered"
          count={counts.delivered}
          icon={<CheckCircle2 className="w-5 h-5" />}
          color="text-emerald-600"
          bgColor="bg-emerald-50 border-emerald-200"
          active={filter === 'delivered'}
          onClick={() => setFilter(filter === 'delivered' ? 'all' : 'delivered')}
        />
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">
            {filter === 'all' ? 'All Shipping Orders' : filter === 'awaiting' ? 'Awaiting Shipment' : filter === 'shipped' ? 'Shipped' : filter === 'in_transit' ? 'In Transit' : 'Delivered'}
          </h3>
          <span className="text-xs text-gray-400">({filteredOrders.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBulkPoll}
            disabled={bulkPolling}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-all disabled:opacity-50"
          >
            {bulkPolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Satellite className="w-3.5 h-3.5" />}
            {bulkPolling ? 'Polling...' : 'Poll All Couriers'}
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-gray-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* POPIA Notice */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
        <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Buyer delivery addresses are encrypted per POPIA. Addresses are only revealed to sellers for orders they need to ship.
        </p>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <Truck className="w-14 h-14 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {filter === 'awaiting' ? 'No orders awaiting shipment' : 'No shipping orders'}
          </h3>
          <p className="text-gray-500 text-sm">
            {filter === 'awaiting'
              ? 'When buyers pay for your items, they will appear here for shipping.'
              : 'Orders will appear here once buyers complete payment.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isExpanded = expandedOrder === order.id;
            const tracking = trackingMap[order.id] || [];
            const address = deliveryAddresses[order.id];
            const trackingConfig = order.tracking_status
              ? TRACKING_STATUS_CONFIG[order.tracking_status as keyof typeof TRACKING_STATUS_CONFIG]
              : null;

            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {/* Main Row */}
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                      <img
                        src={order.listing_image || PLACEHOLDER}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900 truncate">{order.listing_title || 'Item'}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {/* Order Status Badge */}
                            {order.status === 'paid' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                                <Clock className="w-3 h-3" /> Awaiting Shipment
                              </span>
                            )}
                            {order.status === 'shipped' && trackingConfig && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${trackingConfig.bgColor} ${trackingConfig.color}`}>
                                <Truck className="w-3 h-3" /> {order.tracking_status}
                              </span>
                            )}
                            {order.status === 'shipped' && !trackingConfig && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                                <Truck className="w-3 h-3" /> Shipped
                              </span>
                            )}
                            {order.status === 'delivered' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
                                <CheckCircle2 className="w-3 h-3" /> Delivered
                              </span>
                            )}
                            <span className="text-xs text-gray-500">{order.buyer_name_masked || 'Buyer'}</span>
                            <span className="text-xs text-gray-400">{timeAgo(order.created_at)}</span>
                          </div>
                          {/* Tracking Number */}
                          {order.tracking_number && (
                            <p className="text-xs font-mono text-blue-600 mt-1 flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {order.carrier && `${order.carrier}: `}{order.tracking_number}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-emerald-600">{formatZAR(order.amount)}</p>
                          <p className="text-xs text-gray-400 font-mono">#{order.id.slice(0, 8).toUpperCase()}</p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {/* Create Shipment Button (for paid orders) */}
                        {order.status === 'paid' && (
                          <button
                            onClick={() => handleCreateShipment(order.id)}
                            disabled={creatingShipment === order.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all disabled:opacity-50 shadow-sm"
                          >
                            {creatingShipment === order.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Truck className="w-3.5 h-3.5" />
                            )}
                            {creatingShipment === order.id ? 'Creating...' : 'Create Shipment'}
                          </button>
                        )}

                        {/* Refresh Tracking Button (for shipped orders) */}
                        {order.status === 'shipped' && order.tracking_number && (
                          <button
                            onClick={() => handleRefreshTracking(order.id)}
                            disabled={refreshingOrder === order.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all disabled:opacity-50"
                          >
                            {refreshingOrder === order.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Satellite className="w-3.5 h-3.5" />
                            )}
                            Refresh Tracking
                          </button>
                        )}

                        {/* View Label */}
                        {order.label_url && (
                          <button
                            onClick={() => setShowLabel(order)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all"
                          >
                            <ExternalLink className="w-3 h-3" /> Label
                          </button>
                        )}

                        {/* Expand/Collapse */}
                        <button
                          onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-all ml-auto"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          {isExpanded ? 'Less' : 'Details'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4 sm:p-5 space-y-4">
                    {/* Delivery Address */}
                    {order.status === 'paid' && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" /> Delivery Address
                        </h4>
                        {address ? (
                          <p className="text-sm text-gray-700 bg-white rounded-lg p-3 border border-gray-200">{address}</p>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Buyer has not provided a delivery address yet.</p>
                        )}
                      </div>
                    )}

                    {/* Tracking Timeline */}
                    {tracking.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5" /> Tracking History
                        </h4>
                        <div className="space-y-2">
                          {tracking.map((t, idx) => {
                            const config = TRACKING_STATUS_CONFIG[t.status as keyof typeof TRACKING_STATUS_CONFIG];
                            return (
                              <div key={t.id || idx} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-gray-200">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${config?.bgColor || 'bg-gray-100'} ${config?.color || 'text-gray-500'}`}>
                                  {idx === tracking.length - 1 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900">{t.status}</p>
                                  {t.notes && <p className="text-xs text-gray-500 mt-0.5">{t.notes}</p>}
                                  {t.tracking_number && (
                                    <p className="text-xs font-mono text-blue-600 mt-0.5">
                                      {t.carrier && `${t.carrier}: `}{t.tracking_number}
                                    </p>
                                  )}
                                </div>
                                <span className="text-[10px] text-gray-400 flex-shrink-0">
                                  {timeAgo(t.created_at)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Order Info */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white rounded-lg p-2.5 border border-gray-200">
                        <p className="text-gray-400">Order Total</p>
                        <p className="font-bold text-gray-900 mt-0.5">{formatZAR(order.total || order.amount)}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2.5 border border-gray-200">
                        <p className="text-gray-400">Service Fee</p>
                        <p className="font-bold text-gray-900 mt-0.5">{formatZAR(order.service_fee)}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2.5 border border-gray-200">
                        <p className="text-gray-400">Courier</p>
                        <p className="font-bold text-gray-900 mt-0.5">{order.courier_service || order.carrier || 'N/A'}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2.5 border border-gray-200">
                        <p className="text-gray-400">Buyer</p>
                        <p className="font-bold text-gray-900 mt-0.5">{order.buyer_name_masked || 'Buyer'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Shipping Label Modal */}
      <ShippingLabel
        isOpen={!!showLabel}
        onClose={() => setShowLabel(null)}
        labelData={showLabel ? {
          order_id: showLabel.id.slice(0, 12).toUpperCase(),
          tracking_number: showLabel.tracking_number || '',
          courier: showLabel.carrier || showLabel.courier_service || 'ShipLogic',
          seller_name: 'Seller',
          seller_province: '',
          item_description: showLabel.listing_title || 'SnapUp Order',
          item_location: '',
          created_at: showLabel.created_at,
        } : {
          order_id: '',
          tracking_number: '',
          courier: '',
          seller_name: '',
          seller_province: '',
          item_description: '',
          item_location: '',
          created_at: new Date().toISOString(),
        }}
      />

    </div>
  );
};

// Summary Card Sub-component
const SummaryCard: React.FC<{
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, icon, color, bgColor, active, onClick }) => (
  <button
    onClick={onClick}
    className={`p-3 sm:p-4 rounded-xl border text-left transition-all ${
      active
        ? `${bgColor} ring-2 ring-offset-1 ring-current ${color}`
        : 'bg-white border-gray-200 hover:border-gray-300'
    }`}
  >
    <div className={`${color} mb-1`}>{icon}</div>
    <p className={`text-2xl font-bold ${active ? color : 'text-gray-900'}`}>{count}</p>
    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
  </button>
);

export default SellerShippingDashboard;
