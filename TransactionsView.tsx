import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getOrdersWithTracking, formatZAR, timeAgo } from '@/lib/api';
import type { Order, OrderTracking } from '@/types';
import { TRACKING_STATUS_CONFIG, TrackingStatus } from '@/types';
import TrackingTimeline from './TrackingTimeline';
import TrackingUpdateModal from './TrackingUpdateModal';
import {
  Receipt, Loader2, AlertTriangle, RefreshCw, CreditCard,
  ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, XCircle,
  Shield, Wallet, Search, Filter, ChevronDown, ChevronUp,
  Truck, Package, MapPin, Calendar, RotateCcw, Eye
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100&h=100&fit=crop';
const ITEMS_PER_PAGE = 10;

const TransactionsView: React.FC = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'buyer' | 'seller'>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [trackingModal, setTrackingModal] = useState<{
    open: boolean;
    orderId: string;
    orderTitle: string;
    currentStatus?: string;
    currentTrackingNumber?: string | null;
    currentCarrier?: string | null;
  }>({ open: false, orderId: '', orderTitle: '' });

  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getOrdersWithTracking(user.id);
      setOrders(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load transactions');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Real-time subscriptions for orders and tracking
  useEffect(() => {
    if (!user) return;

    const ordersChannel = supabase
      .channel('transactions-orders-rt')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
      }, (payload) => {
        const newOrder = payload.new as any;
        if (!newOrder) return;
        // Only process if user is buyer or seller
        if (newOrder.buyer_id !== user.id && newOrder.seller_id !== user.id) return;

        if (payload.eventType === 'INSERT') {
          toast({ title: 'New Order', description: 'A new order has been created.' });
          loadOrders();
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => prev.map(o =>
            o.id === newOrder.id ? { ...o, ...newOrder } : o
          ));
        }
      })
      .subscribe();

    const trackingChannel = supabase
      .channel('transactions-tracking-rt')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'order_tracking',
      }, (payload) => {
        const newTracking = payload.new as OrderTracking;
        if (!newTracking) return;
        // Update the tracking history for the relevant order
        setOrders(prev => prev.map(o => {
          if (o.id === newTracking.order_id) {
            const existingHistory = o.tracking_history || [];
            // Avoid duplicates
            if (existingHistory.some(t => t.id === newTracking.id)) return o;
            return {
              ...o,
              tracking_history: [...existingHistory, newTracking],
              tracking_status: newTracking.status,
              tracking_number: newTracking.tracking_number || o.tracking_number,
              carrier: newTracking.carrier || o.carrier,
            };
          }
          return o;
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(trackingChannel);
    };
  }, [user, loadOrders]);

  // Filter logic
  const filteredOrders = orders.filter((o) => {
    // Search
    const matchesSearch = !searchQuery ||
      o.listing_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.tracking_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.seller_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.buyer_name?.toLowerCase().includes(searchQuery.toLowerCase());

    // Status
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;

    // Role
    const matchesRole =
      roleFilter === 'all' ||
      (roleFilter === 'buyer' && o.buyer_id === user?.id) ||
      (roleFilter === 'seller' && o.seller_id === user?.id);

    // Date
    let matchesDate = true;
    if (dateFilter !== 'all') {
      const orderDate = new Date(o.created_at);
      const now = new Date();
      if (dateFilter === '7d') {
        matchesDate = (now.getTime() - orderDate.getTime()) <= 7 * 24 * 60 * 60 * 1000;
      } else if (dateFilter === '30d') {
        matchesDate = (now.getTime() - orderDate.getTime()) <= 30 * 24 * 60 * 60 * 1000;
      } else if (dateFilter === '90d') {
        matchesDate = (now.getTime() - orderDate.getTime()) <= 90 * 24 * 60 * 60 * 1000;
      }
    }

    return matchesSearch && matchesStatus && matchesRole && matchesDate;
  });

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, roleFilter, dateFilter]);

  const handleTrackingUpdated = (tracking: OrderTracking) => {
    setOrders(prev => prev.map(o => {
      if (o.id === tracking.order_id) {
        const existingHistory = o.tracking_history || [];
        return {
          ...o,
          tracking_history: [...existingHistory, tracking],
          tracking_status: tracking.status,
          tracking_number: tracking.tracking_number || o.tracking_number,
          carrier: tracking.carrier || o.carrier,
        };
      }
      return o;
    }));
  };

  // Stats
  const stats = {
    total: orders.length,
    purchases: orders.filter(o => o.buyer_id === user?.id).length,
    sales: orders.filter(o => o.seller_id === user?.id).length,
    totalSpent: orders.filter(o => o.buyer_id === user?.id && o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0),
    totalEarned: orders.filter(o => o.seller_id === user?.id && o.status !== 'cancelled').reduce((sum, o) => sum + o.amount, 0),
    pending: orders.filter(o => o.status === 'pending').length,
    shipped: orders.filter(o => o.status === 'shipped').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  };

  const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    pending: { icon: <Clock className="w-3.5 h-3.5" />, color: 'bg-amber-100 text-amber-700', label: 'Pending' },
    paid: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'bg-green-100 text-green-700', label: 'Paid' },
    shipped: { icon: <Truck className="w-3.5 h-3.5" />, color: 'bg-blue-100 text-blue-700', label: 'Shipped' },
    delivered: { icon: <Package className="w-3.5 h-3.5" />, color: 'bg-emerald-100 text-emerald-700', label: 'Delivered' },
    cancelled: { icon: <XCircle className="w-3.5 h-3.5" />, color: 'bg-red-100 text-red-700', label: 'Cancelled' },
    refunded: { icon: <RotateCcw className="w-3.5 h-3.5" />, color: 'bg-orange-100 text-orange-700', label: 'Refunded' },
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            Transactions & Tracking
          </h2>
          <p className="text-gray-500 text-sm mt-1">Manage your orders, payments, and delivery tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400">Live updates</span>
          </div>
          <button
            onClick={loadOrders}
            disabled={loading}
            className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-200"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {!loading && !error && orders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <StatCard icon={<Receipt className="w-4 h-4" />} label="Total Orders" value={String(stats.total)} color="text-gray-700" bg="bg-gray-100" />
          <StatCard icon={<ArrowDownLeft className="w-4 h-4" />} label="Purchases" value={String(stats.purchases)} color="text-blue-600" bg="bg-blue-100" />
          <StatCard icon={<ArrowUpRight className="w-4 h-4" />} label="Sales" value={String(stats.sales)} color="text-emerald-600" bg="bg-emerald-100" />
          <StatCard icon={<Wallet className="w-4 h-4" />} label="Total Spent" value={formatZAR(stats.totalSpent)} color="text-red-600" bg="bg-red-100" />
          <StatCard icon={<Wallet className="w-4 h-4" />} label="Total Earned" value={formatZAR(stats.totalEarned)} color="text-emerald-600" bg="bg-emerald-100" />
          <StatCard icon={<Truck className="w-4 h-4" />} label="In Transit" value={String(stats.shipped)} color="text-blue-600" bg="bg-blue-100" />
        </div>
      )}

      {/* Filters */}
      {!loading && !error && orders.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders, tracking #..."
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {(['all', 'buyer', 'seller'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setRoleFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  roleFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'buyer' ? 'Purchases' : 'Sales'}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-8 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="pl-8 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>
        </div>
      )}

      {/* Results count */}
      {!loading && !error && orders.length > 0 && (
        <p className="text-xs text-gray-400 mb-3">
          Showing {paginatedOrders.length} of {filteredOrders.length} transaction{filteredOrders.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading transactions & tracking...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-16 bg-red-50 rounded-2xl border-2 border-dashed border-red-200">
          <AlertTriangle className="w-12 h-12 text-red-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Failed to load transactions</h3>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button onClick={loadOrders} className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all inline-flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredOrders.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <Receipt className="w-14 h-14 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {orders.length === 0 ? 'No transactions yet' : 'No matching transactions'}
          </h3>
          <p className="text-gray-500 text-sm">
            {orders.length === 0
              ? 'Your orders and tracking information will appear here when you buy or sell items.'
              : 'Try adjusting your search or filter criteria.'}
          </p>
        </div>
      )}

      {/* Orders List */}
      {!loading && !error && paginatedOrders.length > 0 && (
        <div className="space-y-3">
          {paginatedOrders.map((order) => {
            const isBuyer = order.buyer_id === user?.id;
            const isSeller = order.seller_id === user?.id;
            const status = statusConfig[order.status] || statusConfig.pending;
            const isExpanded = expandedOrderId === order.id;
            const latestTracking = order.tracking_history?.length
              ? order.tracking_history[order.tracking_history.length - 1]
              : null;

            return (
              <div
                key={order.id}
                className={`bg-white rounded-2xl border transition-all ${
                  isExpanded ? 'border-blue-200 shadow-lg shadow-blue-50' : 'border-gray-200 hover:shadow-md'
                }`}
              >
                {/* Order Summary Row */}
                <div
                  className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 cursor-pointer"
                  onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                >
                  {/* Image */}
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                    <img
                      src={order.listing_image || PLACEHOLDER_IMAGE}
                      alt={order.listing_title || 'Item'}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE; }}
                    />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                          {order.listing_title || 'Item'}
                        </h3>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                            isBuyer ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {isBuyer ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                            {isBuyer ? 'Purchase' : 'Sale'}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                            {status.icon} {status.label}
                          </span>
                          {latestTracking && latestTracking.status !== 'Pending' && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                              TRACKING_STATUS_CONFIG[latestTracking.status as TrackingStatus]?.bgColor || 'bg-gray-100'
                            } ${
                              TRACKING_STATUS_CONFIG[latestTracking.status as TrackingStatus]?.color || 'text-gray-700'
                            }`}>
                              <Truck className="w-3 h-3" />
                              {latestTracking.status}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold text-base ${isBuyer ? 'text-gray-900' : 'text-emerald-600'}`}>
                          {isBuyer ? '-' : '+'}{formatZAR(order.total)}
                        </p>
                        <p className="text-xs text-gray-400">{timeAgo(order.created_at)}</p>
                      </div>
                    </div>

                    {/* Quick info */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                      <span>{isBuyer ? `Seller: ${order.seller_name || 'Seller'}` : `Buyer: ${order.buyer_name || 'Buyer'}`}</span>
                      <span className="flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        {order.payment_method || 'PayFast'}
                      </span>
                      {order.tracking_number && (
                        <span className="flex items-center gap-1 font-mono text-blue-600">
                          <Package className="w-3 h-3" />
                          {order.tracking_number}
                        </span>
                      )}
                      <span className="font-mono text-gray-400">#{order.id.slice(0, 8).toUpperCase()}</span>
                    </div>
                  </div>

                  {/* Expand Icon */}
                  <div className="flex-shrink-0 pt-1">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-blue-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 sm:p-5 space-y-5">
                    {/* Order Details Grid */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-gray-400" />
                          Payment Details
                        </h4>
                        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Item Price</span>
                            <span className="font-medium">{formatZAR(order.amount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Service Fee</span>
                            <span className="font-medium">{formatZAR(order.service_fee)}</span>
                          </div>
                          <div className="flex justify-between border-t border-gray-200 pt-1.5">
                            <span className="font-semibold text-gray-700">Total</span>
                            <span className="font-bold text-gray-900">{formatZAR(order.total)}</span>
                          </div>
                          {order.payfast_payment_id && (
                            <div className="flex justify-between pt-1">
                              <span className="text-gray-500">PayFast ID</span>
                              <span className="font-mono text-xs text-blue-600">{order.payfast_payment_id}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-500">Method</span>
                            <span>{order.payment_method || 'PayFast'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Date</span>
                            <span>{new Date(order.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                          </div>
                        </div>
                      </div>

                      {/* Tracking Timeline */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Truck className="w-4 h-4 text-gray-400" />
                            Tracking History
                          </h4>
                          {isSeller && order.status !== 'cancelled' && order.status !== 'delivered' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTrackingModal({
                                  open: true,
                                  orderId: order.id,
                                  orderTitle: order.listing_title || 'Order',
                                  currentStatus: latestTracking?.status || 'Pending',
                                  currentTrackingNumber: order.tracking_number,
                                  currentCarrier: order.carrier,
                                });
                              }}
                              className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                            >
                              <Truck className="w-3 h-3" />
                              Update Tracking
                            </button>
                          )}
                        </div>
                        <TrackingTimeline
                          tracking={order.tracking_history || []}
                          trackingNumber={order.tracking_number}
                          carrier={order.carrier}
                        />
                      </div>
                    </div>

                    {/* POPIA Notice */}
                    <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                      <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-700">
                        Transaction data is processed in compliance with POPIA. Personal information is minimized and only shared as necessary for order fulfillment.
                        {isSeller && ' Buyer details are partially anonymized for your protection.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {/* Page numbers */}
            <div className="hidden sm:flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-9 h-9 text-sm font-medium rounded-lg transition-all ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* PayFast Info */}
      <div className="mt-8 flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
        <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Secure Payments & Tracking via PayFast</p>
          <p className="text-xs text-blue-600 mt-1">
            All transactions are processed securely through PayFast, South Africa's leading payment gateway.
            Tracking information is provided by sellers and updated in real-time.
            Your financial data is protected under POPIA regulations and is never stored on our servers.
          </p>
        </div>
      </div>

      {/* Tracking Update Modal */}
      <TrackingUpdateModal
        isOpen={trackingModal.open}
        onClose={() => setTrackingModal({ open: false, orderId: '', orderTitle: '' })}
        orderId={trackingModal.orderId}
        orderTitle={trackingModal.orderTitle}
        currentStatus={trackingModal.currentStatus}
        currentTrackingNumber={trackingModal.currentTrackingNumber}
        currentCarrier={trackingModal.currentCarrier}
        onTrackingUpdated={handleTrackingUpdated}
      />
    </section>
  );
};

// Stat Card Helper
const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bg: string;
}> = ({ icon, label, value, color, bg }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
    <div className={`flex items-center gap-1.5 ${color} text-xs font-medium mb-1`}>
      <div className={`w-5 h-5 rounded-md flex items-center justify-center ${bg}`}>
        {icon}
      </div>
      <span className="truncate">{label}</span>
    </div>
    <p className={`text-lg sm:text-xl font-bold ${color === 'text-gray-700' ? 'text-gray-900' : color}`}>
      {value}
    </p>
  </div>
);

export default TransactionsView;
