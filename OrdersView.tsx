import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getOrdersWithTracking, cancelOrder, addTrackingUpdate, getOrderDispute, formatZAR, timeAgo } from '@/lib/api';
import type { Order, OrderTracking, Dispute } from '@/types';
import { TRACKING_STATUS_CONFIG, TrackingStatus, DISPUTE_STATUS_CONFIG, type DisputeStatus } from '@/types';
import TrackingTimeline from './TrackingTimeline';
import TrackingUpdateModal from './TrackingUpdateModal';
import RateSellerModal from './RateSellerModal';
import DisputeModal from './DisputeModal';
import OrderDetailView from './OrderDetailView';
import LiveTrackingView from './LiveTrackingView';
import ExportOrdersModal from './ExportOrdersModal';
import { downloadCSV, generateFilename, formatExportDateTime, formatExportZAR } from '@/lib/export';
import {
  Package, ShoppingBag, Clock, CheckCircle2, XCircle, Truck,
  ArrowDownLeft, ArrowUpRight, Loader2, AlertTriangle, RefreshCw,
  CreditCard, ExternalLink, Ban, RotateCcw, ChevronDown, ChevronUp,
  Star, Shield, Eye, Flag, ChevronRight, Radio, FileSpreadsheet, Download,
  Search, SlidersHorizontal, Calendar, ArrowUpDown, X, Filter
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

type StatusFilter = 'all' | 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
type SortOption = 'newest' | 'oldest' | 'highest' | 'lowest';

const STATUS_TABS: { key: StatusFilter; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'all', label: 'All', icon: <ShoppingBag className="w-3.5 h-3.5" />, color: 'text-gray-600' },
  { key: 'pending', label: 'Pending', icon: <Clock className="w-3.5 h-3.5" />, color: 'text-amber-600' },
  { key: 'paid', label: 'Paid', icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-green-600' },
  { key: 'shipped', label: 'Shipped', icon: <Truck className="w-3.5 h-3.5" />, color: 'text-blue-600' },
  { key: 'delivered', label: 'Delivered', icon: <Package className="w-3.5 h-3.5" />, color: 'text-emerald-600' },
  { key: 'cancelled', label: 'Cancelled', icon: <XCircle className="w-3.5 h-3.5" />, color: 'text-red-600' },
];

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'newest', label: 'Newest First' },
  { key: 'oldest', label: 'Oldest First' },
  { key: 'highest', label: 'Highest Value' },
  { key: 'lowest', label: 'Lowest Value' },
];

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100&h=100&fit=crop';

interface OrdersViewProps {
  onViewChange?: (view: string) => void;
}

const OrdersView: React.FC<OrdersViewProps> = ({ onViewChange }) => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [roleFilter, setRoleFilter] = useState<'all' | 'purchases' | 'sales'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [liveTrackingOrderId, setLiveTrackingOrderId] = useState<string | null>(null);
  const [trackingModal, setTrackingModal] = useState<{
    open: boolean;
    orderId: string;
    orderTitle: string;
    currentStatus?: string;
    currentTrackingNumber?: string | null;
    currentCarrier?: string | null;
  }>({ open: false, orderId: '', orderTitle: '' });
  const [rateModal, setRateModal] = useState<{
    open: boolean;
    orderId: string;
    sellerId: string;
    sellerName: string;
  }>({ open: false, orderId: '', sellerId: '', sellerName: '' });
  const [disputeModal, setDisputeModal] = useState<{
    open: boolean;
    orderId: string;
    orderTitle: string;
    orderAmount: number;
    orderImage?: string;
  }>({ open: false, orderId: '', orderTitle: '', orderAmount: 0 });
  const [showExportModal, setShowExportModal] = useState(false);




  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getOrdersWithTracking(user.id);
      setOrders(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Real-time subscriptions
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('orders-view-rt')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
      }, (payload) => {
        const newOrder = payload.new as any;
        if (!newOrder) return;
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
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'order_tracking',
      }, (payload) => {
        const newTracking = payload.new as OrderTracking;
        if (!newTracking) return;
        setOrders(prev => prev.map(o => {
          if (o.id === newTracking.order_id) {
            const existingHistory = o.tracking_history || [];
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
      supabase.removeChannel(channel);
    };
  }, [user, loadOrders]);

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    setCancellingId(orderId);
    try {
      await cancelOrder(orderId);
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'cancelled' } : o));
      toast({ title: 'Order cancelled', description: 'Your order has been cancelled successfully.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to cancel order', variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
  };

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
          status: tracking.status === 'Delivered' ? 'delivered' :
                  tracking.status === 'Cancelled' ? 'cancelled' :
                  ['Shipped', 'In Transit', 'Out for Delivery'].includes(tracking.status) ? 'shipped' : o.status,
        };
      }
      return o;
    }));
  };

  // ============ ADVANCED FILTERING ============
  const roleFiltered = useMemo(() => {
    return orders.filter((o) => {
      if (roleFilter === 'purchases') return o.buyer_id === user?.id;
      if (roleFilter === 'sales') return o.seller_id === user?.id;
      return true;
    });
  }, [orders, roleFilter, user]);

  // Status counts for badges (from role-filtered set)
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: roleFiltered.length,
      pending: 0, paid: 0, shipped: 0, delivered: 0, cancelled: 0, refunded: 0,
    };
    roleFiltered.forEach(o => {
      const s = o.status as StatusFilter;
      if (counts[s] !== undefined) counts[s]++;
    });
    return counts;
  }, [roleFiltered]);

  // Apply all filters
  const filtered = useMemo(() => {
    let result = [...roleFiltered];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(o => o.status === statusFilter);
    }

    // Search filter (title or order ID)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(o =>
        (o.listing_title || '').toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (o.tracking_number || '').toLowerCase().includes(q) ||
        (o.seller_name || '').toLowerCase().includes(q) ||
        (o.buyer_name || '').toLowerCase().includes(q)
      );
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter(o => new Date(o.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(o => new Date(o.created_at) <= to);
    }

    // Price range filter
    if (priceMin) {
      const min = parseFloat(priceMin);
      if (!isNaN(min)) result = result.filter(o => (o.total || o.amount || 0) >= min);
    }
    if (priceMax) {
      const max = parseFloat(priceMax);
      if (!isNaN(max)) result = result.filter(o => (o.total || o.amount || 0) <= max);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'highest': return (b.total || b.amount || 0) - (a.total || a.amount || 0);
        case 'lowest': return (a.total || a.amount || 0) - (b.total || b.amount || 0);
        default: return 0;
      }
    });

    return result;
  }, [roleFiltered, statusFilter, searchQuery, dateFrom, dateTo, priceMin, priceMax, sortBy]);

  const activeFilterCount = [
    statusFilter !== 'all',
    searchQuery.trim(),
    dateFrom,
    dateTo,
    priceMin,
    priceMax,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setPriceMin('');
    setPriceMax('');
    setSortBy('newest');
  };

  // CSV Export for filtered results
  const handleExportFilteredCSV = () => {
    if (filtered.length === 0) {
      toast({ title: 'No data', description: 'No orders match the current filters to export.', variant: 'destructive' });
      return;
    }
    const headers = [
      { key: 'id', label: 'Order ID' },
      { key: 'listing_title', label: 'Item' },
      { key: 'status', label: 'Status' },
      { key: 'amount', label: 'Amount (ZAR)' },
      { key: 'total', label: 'Total (ZAR)' },
      { key: 'role', label: 'Role' },
      { key: 'tracking_number', label: 'Tracking Number' },
      { key: 'seller_name', label: 'Seller' },
      { key: 'buyer_name', label: 'Buyer' },
      { key: 'created_at', label: 'Date' },
    ];
    const rows = filtered.map(o => ({
      id: o.id,
      listing_title: o.listing_title || '',
      status: o.status,
      amount: formatExportZAR(o.amount),
      total: formatExportZAR(o.total),
      role: o.buyer_id === user?.id ? 'Buyer' : 'Seller',
      tracking_number: o.tracking_number || '',
      seller_name: o.seller_name || '',
      buyer_name: o.buyer_name || '',
      created_at: formatExportDateTime(o.created_at),
    }));
    const filename = generateFilename('snapup-orders-filtered', 'csv');
    downloadCSV(headers, rows, filename);
    toast({ title: 'Exported', description: `${filtered.length} orders exported to CSV.` });
  };

  const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    pending: { icon: <Clock className="w-4 h-4" />, color: 'bg-amber-100 text-amber-700', label: 'Pending Payment' },
    paid: { icon: <CheckCircle2 className="w-4 h-4" />, color: 'bg-green-100 text-green-700', label: 'Paid' },
    shipped: { icon: <Truck className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700', label: 'Shipped' },
    delivered: { icon: <Package className="w-4 h-4" />, color: 'bg-emerald-100 text-emerald-700', label: 'Delivered' },
    cancelled: { icon: <XCircle className="w-4 h-4" />, color: 'bg-red-100 text-red-700', label: 'Cancelled' },
    refunded: { icon: <RotateCcw className="w-4 h-4" />, color: 'bg-orange-100 text-orange-700', label: 'Refunded' },
  };

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    shipped: orders.filter((o) => o.status === 'shipped').length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
    purchases: orders.filter((o) => o.buyer_id === user?.id).length,
    sales: orders.filter((o) => o.seller_id === user?.id).length,
  };


  // If an order is selected, show the detail view
  // If live tracking is open, show the LiveTrackingView
  if (liveTrackingOrderId) {
    return (
      <LiveTrackingView
        orderId={liveTrackingOrderId}
        onBack={() => setLiveTrackingOrderId(null)}
      />
    );
  }

  // If an order is selected, show the detail view
  if (selectedOrderId) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <OrderDetailView
          orderId={selectedOrderId}
          onBack={() => setSelectedOrderId(null)}
          onOpenDispute={(orderId, title, amount, image) => {
            setSelectedOrderId(null);
            setDisputeModal({ open: true, orderId, orderTitle: title, orderAmount: amount, orderImage: image });
          }}
          onRateSeller={(orderId, sellerId, sellerName) => {
            setSelectedOrderId(null);
            setRateModal({ open: true, orderId, sellerId, sellerName });
          }}
          onOpenLiveTracking={(orderId) => {
            setSelectedOrderId(null);
            setLiveTrackingOrderId(orderId);
          }}
        />
      </section>
    );
  }


  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            My Orders
          </h2>
          <p className="text-gray-500 text-sm mt-1">Track your purchases and sales with delivery tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400">Live</span>
          </div>
          <button
            onClick={loadOrders}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {(['all', 'purchases', 'sales'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setRoleFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  roleFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {!loading && !error && orders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
              <ShoppingBag className="w-3.5 h-3.5" /> Total
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-blue-600 text-xs font-medium mb-1">
              <Truck className="w-3.5 h-3.5" /> In Transit
            </div>
            <p className="text-2xl font-bold text-blue-600">{stats.shipped}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium mb-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Delivered
            </div>
            <p className="text-2xl font-bold text-emerald-600">{stats.delivered}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-amber-600 text-xs font-medium mb-1">
              <Clock className="w-3.5 h-3.5" /> Pending
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
          </div>
        </div>
      )}

      {/* ============ SEARCH & FILTER BAR ============ */}
      {!loading && !error && orders.length > 0 && (
        <div className="mb-6 space-y-3">
          {/* Search + Sort + Advanced Toggle Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by item name, order ID, tracking number, or seller..."
                className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="appearance-none pl-9 pr-8 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer min-w-[160px]"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Advanced Filters Toggle */}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border transition-all ${
                showAdvancedFilters || activeFilterCount > 0
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                  statusFilter === tab.key
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                {tab.label}
                {statusCounts[tab.key] > 0 && (
                  <span className={`min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold ${
                    statusFilter === tab.key
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {statusCounts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Advanced Filters Panel */}
          {showAdvancedFilters && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-indigo-500" />
                  Advanced Filters
                </h4>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="text-xs font-medium text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-all"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Date Range */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Date From
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Date To
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Price Range */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" /> Min Price (ZAR)
                  </label>
                  <input
                    type="number"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" /> Max Price (ZAR)
                  </label>
                  <input
                    type="number"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                    placeholder="No limit"
                    min="0"
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Results count + Export filtered */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Showing <span className="font-semibold text-gray-700">{filtered.length}</span>
              {filtered.length !== roleFiltered.length && (
                <> of <span className="font-semibold text-gray-700">{roleFiltered.length}</span></>
              )}
              {' '}order{filtered.length !== 1 ? 's' : ''}
              {activeFilterCount > 0 && (
                <span className="text-indigo-600 ml-1">({activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active)</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear filters
                </button>
              )}
              {filtered.length > 0 && (
                <button
                  onClick={handleExportFilteredCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all"
                  title="Export filtered results as CSV"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export Filtered CSV
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading orders & tracking...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-20 bg-red-50 rounded-2xl border-2 border-dashed border-red-200">
          <AlertTriangle className="w-16 h-16 text-red-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Failed to load orders</h3>
          <p className="text-gray-500 mb-4">{error}</p>
          <button onClick={loadOrders} className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && orders.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">No orders yet</h3>
          <p className="text-gray-500">
            When you buy or sell items, your orders will appear here with tracking.
          </p>
        </div>
      )}

      {/* No filtered results */}
      {!loading && !error && orders.length > 0 && filtered.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No matching orders</h3>
          <p className="text-gray-500 text-sm mb-4">
            No orders match your current filters. Try adjusting your search or filters.
          </p>
          <button
            onClick={clearAllFilters}
            className="px-5 py-2 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all inline-flex items-center gap-2 text-sm"
          >
            <X className="w-4 h-4" /> Clear All Filters
          </button>
        </div>
      )}

      {/* Orders List */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((order) => {
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
                {/* Order Row */}
                <div
                  className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 cursor-pointer"
                  onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                    <img
                      src={order.listing_image || PLACEHOLDER_IMAGE}
                      alt={order.listing_title || 'Item'}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE; }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
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
                          {order.tracking_number && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-blue-600 bg-blue-50 rounded-full">
                              <Package className="w-3 h-3" />
                              {order.tracking_number}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 flex items-center gap-2">
                        <div>
                          <p className={`font-bold text-base sm:text-lg ${isBuyer ? 'text-gray-900' : 'text-emerald-600'}`}>
                            {isBuyer ? '-' : '+'}{formatZAR(order.total)}
                          </p>
                          <p className="text-xs text-gray-400">{timeAgo(order.created_at)}</p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-blue-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                      <span>{isBuyer ? 'From' : 'To'}: {isBuyer ? order.seller_name : order.buyer_name || 'User'}</span>
                      <span className="flex items-center gap-1">
                        <CreditCard className="w-3 h-3" /> PayFast
                      </span>
                      <span className="font-mono text-gray-400">#{order.id.slice(0, 8).toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                {/* Expanded: Tracking + Actions */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 sm:p-5 space-y-4">
                    {/* View Full Details Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOrderId(order.id);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 hover:from-blue-100 hover:to-indigo-100 transition-all group"
                    >
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-700">View Full Order Details</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-blue-500 group-hover:translate-x-0.5 transition-transform" />
                    </button>

                    {/* Tracking Timeline */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          <Truck className="w-4 h-4 text-blue-500" />
                          Delivery Tracking
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

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {order.status === 'pending' && isBuyer && (
                        <button
                          onClick={() => handleCancelOrder(order.id)}
                          disabled={cancellingId === order.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all disabled:opacity-50"
                        >
                          {cancellingId === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                          Cancel Order
                        </button>
                      )}
                      {isBuyer && ['paid', 'shipped', 'delivered'].includes(order.status) && (
                        <button
                          onClick={() => setDisputeModal({
                            open: true,
                            orderId: order.id,
                            orderTitle: order.listing_title || 'Order',
                            orderAmount: order.amount,
                            orderImage: order.listing_image,
                          })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-all"
                        >
                          <Flag className="w-3 h-3" />
                          Report Issue
                        </button>
                      )}
                      {order.status === 'delivered' && isBuyer && (
                        <button
                          onClick={() => setRateModal({
                            open: true,
                            orderId: order.id,
                            sellerId: order.seller_id,
                            sellerName: order.seller_name || 'Seller',
                          })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-all"
                        >
                          <Star className="w-3 h-3" />
                          Rate Seller
                        </button>
                      )}
                    </div>

                    {/* POPIA Notice */}
                    <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                      <Shield className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-blue-700">
                        Order data handled per POPIA. Personal info minimized for privacy.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* PayFast Info Footer */}
      <div className="mt-8 bg-blue-50 rounded-xl p-4 flex items-start gap-3">
        <ExternalLink className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">PayFast Payment Integration with Tracking</p>
          <p className="text-xs text-blue-600 mt-1">
            All payments are processed securely through PayFast. Sellers can update delivery tracking in real-time.
            Your financial data is never stored on our servers. Protected under POPIA regulations.
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

      {rateModal.open && user && (
        <RateSellerModal
          isOpen={rateModal.open}
          onClose={() => setRateModal({ open: false, orderId: '', sellerId: '', sellerName: '' })}
          orderId={rateModal.orderId}
          sellerId={rateModal.sellerId}
          buyerId={user.id}
          sellerName={rateModal.sellerName}
          onRated={() => {
            toast({ title: 'Rating submitted', description: 'Thank you for your feedback!' });
            setRateModal({ open: false, orderId: '', sellerId: '', sellerName: '' });
          }}
        />
      )}

      {/* Dispute Modal */}
      <DisputeModal
        isOpen={disputeModal.open}
        onClose={() => setDisputeModal({ open: false, orderId: '', orderTitle: '', orderAmount: 0 })}
        orderId={disputeModal.orderId}
        orderTitle={disputeModal.orderTitle}
        orderAmount={disputeModal.orderAmount}
        orderImage={disputeModal.orderImage}
        onDisputeCreated={loadOrders}
      />

      {/* Export Orders Modal */}
      {user && (
        <ExportOrdersModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          orders={orders}
          userId={user.id}
        />
      )}
    </section>
  );
};

export default OrdersView;
