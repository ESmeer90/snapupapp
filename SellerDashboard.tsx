import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  getSellerAnalytics, getSellerOrders, getUserListings, getSellerRatings,
  getSellerRatingSummary, deleteListing, updateOrderStatus, addTrackingUpdate,
  formatZAR, timeAgo, pollCourierTracking, getSellerPromoStatus
} from '@/lib/api';
import type { Listing, SellerAnalytics, SellerOrder, SellerRating, OrderTracking, SellerPromoStatus } from '@/types';
import { TRACKING_STATUSES, SA_CARRIERS, type TrackingStatus } from '@/types';
import EditListingModal from './EditListingModal';
import DashboardMessages from './DashboardMessages';
import DisputesList from './DisputesList';
import TrackingUpdateModal from './TrackingUpdateModal';
import EarningsPayouts from './EarningsPayouts';
import PromoBanner from './PromoBanner';
import SellerShippingDashboard from './SellerShippingDashboard';

import SalesReportExport from './SalesReportExport';
import SellerOrdersCSVExport from './SellerOrdersCSVExport';
import ReviewAnalytics from './ReviewAnalytics';


import {
  BarChart3, Package, ShoppingBag, Star, Eye, DollarSign,
  Clock, CheckCircle2, XCircle, Truck, RotateCcw, Loader2, RefreshCw,
  AlertTriangle, Plus, Trash2, Edit3, MapPin, CreditCard, Shield,
  ChevronRight, Activity, Award, Users, MessageSquare, Flag, TrendingUp,
  Wallet, Satellite, Download, FileSpreadsheet
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const PLACEHOLDER = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=150&fit=crop';

type DashboardTab = 'overview' | 'listings' | 'orders' | 'shipping' | 'earnings' | 'messages' | 'disputes' | 'ratings';



interface SellerDashboardProps {
  onViewChange?: (view: string) => void;
}

const SellerDashboard: React.FC<SellerDashboardProps> = ({ onViewChange }) => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [ratings, setRatings] = useState<SellerRating[]>([]);
  const [ratingSummary, setRatingSummary] = useState<{ average: number; total: number; distribution: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editListing, setEditListing] = useState<Listing | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [trackingModal, setTrackingModal] = useState<{
    open: boolean;
    orderId: string;
    orderTitle: string;
    currentStatus?: string;
    currentTrackingNumber?: string | null;
    currentCarrier?: string | null;
  }>({ open: false, orderId: '', orderTitle: '' });
  const [showSalesReport, setShowSalesReport] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [analyticsData, listingsData, ordersData, ratingsData, ratingSummaryData] = await Promise.allSettled([
        getSellerAnalytics(user.id),
        getUserListings(user.id),
        getSellerOrders(user.id),
        getSellerRatings(user.id),
        getSellerRatingSummary(user.id),
      ]);
      if (analyticsData.status === 'fulfilled') setAnalytics(analyticsData.value);
      if (listingsData.status === 'fulfilled') setListings(listingsData.value);
      if (ordersData.status === 'fulfilled') setOrders(ordersData.value);
      if (ratingsData.status === 'fulfilled') setRatings(ratingsData.value);
      if (ratingSummaryData.status === 'fulfilled') setRatingSummary(ratingSummaryData.value);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscriptions
  useEffect(() => {
    if (!user) return;

    const ordersChannel = supabase
      .channel('seller-orders-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `seller_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          toast({ title: 'New Order!', description: 'You have a new order. Refreshing...' });
          loadData();
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => prev.map(o => o.id === (payload.new as any).id ? { ...o, ...(payload.new as any) } : o));
          loadData();
        }
      })
      .subscribe();

    const listingsChannel = supabase
      .channel('seller-listings-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'listings',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setListings(prev => prev.map(l => l.id === (payload.new as any).id ? { ...l, ...(payload.new as any) } : l));
      })
      .subscribe();

    const ratingsChannel = supabase
      .channel('seller-ratings-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'seller_ratings',
        filter: `seller_id=eq.${user.id}`,
      }, () => {
        toast({ title: 'New Rating!', description: 'Someone rated you. Refreshing...' });
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(listingsChannel);
      supabase.removeChannel(ratingsChannel);
    };
  }, [user, loadData]);

  const handleDeleteListing = async (id: string) => {
    if (!confirm('Are you sure you want to delete this listing?')) return;
    setDeletingId(id);
    try {
      await deleteListing(id);
      setListings(prev => prev.filter(l => l.id !== id));
      toast({ title: 'Deleted', description: 'Listing removed successfully.' });
      loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to delete', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    setUpdatingOrderId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus as any);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as any } : o));
      toast({ title: 'Order updated', description: `Order marked as ${newStatus}.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update order', variant: 'destructive' });
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleTrackingUpdated = (tracking: OrderTracking) => {
    setOrders(prev => prev.map(o => {
      if (o.id === tracking.order_id) {
        return {
          ...o,
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

  const handleListingUpdated = (updated: Listing) => {
    setListings(prev => prev.map(l => l.id === updated.id ? updated : l));
    loadData();
  };

  const handleOpenMessages = () => {
    if (onViewChange) {
      onViewChange('messages');
    } else {
      setActiveTab('messages');
    }
  };

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
        <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Seller Dashboard</h2>
        <p className="text-gray-500 mb-6">Sign in to access your seller dashboard.</p>
        <a href="/login" className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
          Sign In
        </a>
      </div>
    );
  }

  const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string; bg: string }> = {
    pending: { icon: <Clock className="w-3.5 h-3.5" />, color: 'text-amber-700', label: 'Pending', bg: 'bg-amber-100' },
    paid: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-green-700', label: 'Paid', bg: 'bg-green-100' },
    shipped: { icon: <Truck className="w-3.5 h-3.5" />, color: 'text-blue-700', label: 'Shipped', bg: 'bg-blue-100' },
    delivered: { icon: <Package className="w-3.5 h-3.5" />, color: 'text-emerald-700', label: 'Delivered', bg: 'bg-emerald-100' },
    cancelled: { icon: <XCircle className="w-3.5 h-3.5" />, color: 'text-red-700', label: 'Cancelled', bg: 'bg-red-100' },
    refunded: { icon: <RotateCcw className="w-3.5 h-3.5" />, color: 'text-orange-700', label: 'Refunded', bg: 'bg-orange-100' },
  };

  const tabs: { id: DashboardTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'listings', label: 'Listings', icon: <Package className="w-4 h-4" />, count: listings.length },
    { id: 'orders', label: 'Orders', icon: <ShoppingBag className="w-4 h-4" />, count: orders.length },
    { id: 'shipping', label: 'Shipping', icon: <Truck className="w-4 h-4" />, count: orders.filter(o => o.status === 'paid' || o.status === 'shipped').length },
    { id: 'earnings', label: 'Earnings', icon: <Wallet className="w-4 h-4" /> },
    { id: 'messages', label: 'Messages', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'disputes', label: 'Disputes', icon: <Flag className="w-4 h-4" /> },
    { id: 'ratings', label: 'Ratings', icon: <Star className="w-4 h-4" />, count: ratings.length },
  ];



  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Seller Dashboard</h1>
              <p className="text-sm text-gray-500">
                Welcome back, {profile?.full_name || 'Seller'}
                {analytics && analytics.avg_rating > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    {analytics.avg_rating}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PollCourierButton />
          {/* Sales Report Export Button */}
          <button
            onClick={() => setShowSalesReport(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all"
            title="Export sales report"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sales Report</span>
          </button>
          <button onClick={loadData} disabled={loading}
            className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-200" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a href="/post-item"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-200">
            <Plus className="w-4 h-4" />New Listing
          </a>
        </div>

      </div>

      {/* Promo Banner */}
      <PromoBanner variant="compact" className="mb-4" />

      {/* Real-time indicator */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        <span className="text-xs text-gray-400">Live updates enabled</span>
      </div>


      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && !['messages', 'earnings'].includes(activeTab) && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading dashboard...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && !['messages', 'earnings'].includes(activeTab) && (
        <div className="text-center py-16 bg-red-50 rounded-2xl border-2 border-dashed border-red-200">
          <AlertTriangle className="w-12 h-12 text-red-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Failed to load dashboard</h3>
          <p className="text-gray-500 mb-4 text-sm">{error}</p>
          <button onClick={loadData} className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all inline-flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {/* Content */}
      {(!loading || ['messages', 'earnings'].includes(activeTab)) && !error && (
        <>
          {/* ===== OVERVIEW TAB ===== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard icon={<DollarSign className="w-5 h-5" />} iconBg="bg-emerald-100 text-emerald-600" label="Total Revenue" value={formatZAR(analytics?.total_revenue || 0)} sub={analytics?.total_fees ? `Fees: ${formatZAR(analytics.total_fees)}` : undefined} />
                <StatCard icon={<ShoppingBag className="w-5 h-5" />} iconBg="bg-blue-100 text-blue-600" label="Total Orders" value={String(analytics?.total_orders || 0)} sub={`${analytics?.completed_orders || 0} completed`} />
                <StatCard icon={<Eye className="w-5 h-5" />} iconBg="bg-purple-100 text-purple-600" label="Total Views" value={String(analytics?.total_views || 0)} sub={`${analytics?.active_listings || 0} active listings`} />
                <StatCard icon={<Star className="w-5 h-5" />} iconBg="bg-amber-100 text-amber-600" label="Seller Rating" value={analytics?.avg_rating ? `${analytics.avg_rating}/5` : 'No ratings'} sub={`${analytics?.total_ratings || 0} reviews`} />
              </div>

              {/* Revenue Chart */}
              {analytics && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    Revenue Overview (Commission-Based)
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-emerald-50 rounded-xl">
                      <p className="text-2xl font-bold text-emerald-700">{formatZAR(analytics.total_revenue)}</p>
                      <p className="text-xs text-emerald-600 mt-1">Gross Revenue</p>
                      <div className="w-full bg-emerald-200 rounded-full h-2 mt-2">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '100%' }} />
                      </div>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-xl">
                      <p className="text-2xl font-bold text-red-600">{formatZAR(analytics.total_fees)}</p>
                      <p className="text-xs text-red-500 mt-1">Commission (5-12%)</p>
                      <div className="w-full bg-red-200 rounded-full h-2 mt-2">
                        <div className="bg-red-400 h-2 rounded-full" style={{ width: analytics.total_revenue > 0 ? `${(analytics.total_fees / analytics.total_revenue) * 100}%` : '0%' }} />
                      </div>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-xl">
                      <p className="text-2xl font-bold text-blue-700">{formatZAR(analytics.total_revenue - analytics.total_fees)}</p>
                      <p className="text-xs text-blue-600 mt-1">Net Earnings</p>
                      <div className="w-full bg-blue-200 rounded-full h-2 mt-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: analytics.total_revenue > 0 ? `${((analytics.total_revenue - analytics.total_fees) / analytics.total_revenue) * 100}%` : '0%' }} />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-3 text-center">Commission rates: 12% under R500 | 10% R500-R2,000 | 5% over R2,000</p>
                </div>
              )}



              {/* Quick Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <MiniStat label="Active" value={analytics?.active_listings || 0} color="text-emerald-600" />
                <MiniStat label="Sold" value={analytics?.sold_listings || 0} color="text-blue-600" />
                <MiniStat label="Pending Orders" value={analytics?.pending_orders || 0} color="text-amber-600" />
                <MiniStat label="Total Listings" value={analytics?.total_listings || 0} color="text-gray-700" />
                <MiniStat label="Completed" value={analytics?.completed_orders || 0} color="text-emerald-600" />
              </div>

              {/* Two Column Layout: Recent Orders + Messages */}
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-600" />
                      Recent Orders
                    </h3>
                    <button onClick={() => setActiveTab('orders')} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      View All <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {orders.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">No orders yet. Start selling!</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {orders.slice(0, 5).map((order) => {
                        const sc = statusConfig[order.status] || statusConfig.pending;
                        return (
                          <div key={order.id} className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                              <img src={order.listing_image || PLACEHOLDER} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{order.listing_title || 'Item'}</p>
                              <p className="text-xs text-gray-500">{order.buyer_name_masked || 'Buyer'} &middot; {timeAgo(order.created_at)}</p>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${sc.bg} ${sc.color}`}>
                              {sc.icon} {sc.label}
                            </span>
                            <span className="text-sm font-bold text-emerald-600 flex-shrink-0">{formatZAR(order.amount)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
                  <DashboardMessages onOpenMessages={handleOpenMessages} />
                </div>
              </div>

              {/* Recent Ratings */}
              {ratings.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Award className="w-4 h-4 text-amber-500" />
                      Recent Ratings
                    </h3>
                    <button onClick={() => setActiveTab('ratings')} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      View All <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {ratings.slice(0, 3).map((r) => (
                      <div key={r.id} className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star key={s} className={`w-4 h-4 ${s <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                            ))}
                          </div>
                          <span className="text-xs text-gray-500">{r.buyer_name_masked || 'Buyer'} &middot; {timeAgo(r.created_at)}</span>
                        </div>
                        {r.review && <p className="text-sm text-gray-600 mt-1">{r.review}</p>}
                        <p className="text-xs text-gray-400 mt-1">For: {r.listing_title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== LISTINGS TAB ===== */}
          {activeTab === 'listings' && (
            <div>
              {listings.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                  <Package className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No listings yet</h3>
                  <p className="text-gray-500 text-sm mb-4">Create your first listing to start selling!</p>
                  <a href="/post-item" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all text-sm">
                    <Plus className="w-4 h-4" /> Create Listing
                  </a>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-4 text-sm text-gray-500 flex-wrap">
                    <span>{listings.length} total</span>
                    <span className="text-emerald-600">{listings.filter(l => l.status === 'active').length} active</span>
                    <span className="text-blue-600">{listings.filter(l => l.status === 'sold').length} sold</span>
                    <span className="text-gray-400">{listings.filter(l => l.status === 'archived').length} archived</span>
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Listing</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Views</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Listed</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {listings.map((listing) => (
                          <tr key={listing.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                  <img src={listing.images?.[0] || PLACEHOLDER} alt={listing.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{listing.title}</p>
                                  <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{listing.location}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-bold text-gray-900">{formatZAR(listing.price)}</span>
                              {listing.is_negotiable && <span className="block text-xs text-amber-600">Negotiable</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${listing.status === 'active' ? 'bg-emerald-100 text-emerald-700' : listing.status === 'sold' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-4 py-3"><span className="text-sm text-gray-700 flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-gray-400" />{listing.view_count}</span></td>
                            <td className="px-4 py-3"><span className="text-xs text-gray-500">{timeAgo(listing.created_at)}</span></td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => setEditListing(listing)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit"><Edit3 className="w-4 h-4" /></button>
                                <button onClick={() => handleDeleteListing(listing.id)} disabled={deletingId === listing.id} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50" title="Delete">
                                  {deletingId === listing.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {listings.map((listing) => (
                      <div key={listing.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex gap-3">
                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                          <img src={listing.images?.[0] || PLACEHOLDER} alt={listing.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{listing.title}</p>
                          <p className="text-base font-bold text-blue-600">{formatZAR(listing.price)}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <button onClick={() => setEditListing(listing)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"><Edit3 className="w-3 h-3" /> Edit</button>
                            <button onClick={() => handleDeleteListing(listing.id)} disabled={deletingId === listing.id} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all disabled:opacity-50">
                              {deletingId === listing.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== ORDERS TAB ===== */}
          {activeTab === 'orders' && (
            <div>
              {orders.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                  <ShoppingBag className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No orders yet</h3>
                  <p className="text-gray-500 text-sm">When buyers purchase your items, orders will appear here.</p>
                </div>
              ) : (
                <>
                  {/* Orders Header with CSV Export */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span>{orders.length} total orders</span>
                      <span className="text-emerald-600">{orders.filter(o => o.status === 'delivered').length} delivered</span>
                      <span className="text-blue-600">{orders.filter(o => o.status === 'shipped').length} shipped</span>
                    </div>
                    <SellerOrdersCSVExport orders={orders} />
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl mb-4">
                    <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700">
                      Buyer information is anonymized per POPIA. Use "Update Tracking" to add carrier and tracking number.
                    </p>
                  </div>

                  <div className="space-y-3">

                    {orders.map((order) => {
                      const sc = statusConfig[order.status] || statusConfig.pending;
                      const canUpdateTracking = ['paid', 'shipped'].includes(order.status);
                      return (
                        <div key={order.id} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
                          <div className="flex items-start gap-3 sm:gap-4">
                            <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                              <img src={order.listing_image || PLACEHOLDER} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-gray-900 truncate">{order.listing_title || 'Item'}</p>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${sc.bg} ${sc.color}`}>{sc.icon} {sc.label}</span>
                                    <span className="text-xs text-gray-500">{order.buyer_name_masked || 'Buyer'}</span>
                                    <span className="text-xs text-gray-400">{timeAgo(order.created_at)}</span>
                                  </div>
                                  {order.tracking_number && (
                                    <p className="text-xs font-mono text-blue-600 mt-1 flex items-center gap-1">
                                      <Package className="w-3 h-3" /> {order.carrier && `${order.carrier}: `}{order.tracking_number}
                                    </p>
                                  )}
                                  {order.tracking_status && (
                                    <p className="text-xs text-gray-500 mt-0.5">Tracking: {order.tracking_status}</p>
                                  )}
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-sm font-bold text-emerald-600">{formatZAR(order.amount)}</p>
                                  {order.service_fee > 0 && <p className="text-xs text-gray-400">Fee: {formatZAR(order.service_fee)}</p>}
                                  <p className="text-xs text-gray-400 font-mono mt-0.5">#{order.id.slice(0, 8).toUpperCase()}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-3 flex-wrap">
                                {canUpdateTracking && (
                                  <button
                                    onClick={() => setTrackingModal({
                                      open: true,
                                      orderId: order.id,
                                      orderTitle: order.listing_title || 'Order',
                                      currentStatus: order.tracking_status || 'Processing',
                                      currentTrackingNumber: order.tracking_number,
                                      currentCarrier: order.carrier,
                                    })}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
                                  >
                                    <Truck className="w-3.5 h-3.5" />Update Tracking
                                  </button>
                                )}
                                {order.status === 'paid' && (
                                  <button
                                    onClick={() => handleUpdateOrderStatus(order.id, 'shipped')}
                                    disabled={updatingOrderId === order.id}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all disabled:opacity-50"
                                  >
                                    {updatingOrderId === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                                    Mark Shipped
                                  </button>
                                )}
                                {order.status === 'shipped' && (
                                  <button
                                    onClick={() => handleUpdateOrderStatus(order.id, 'delivered')}
                                    disabled={updatingOrderId === order.id}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-all disabled:opacity-50"
                                  >
                                    {updatingOrderId === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                    Mark Delivered
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== SHIPPING TAB ===== */}
          {activeTab === 'shipping' && (
            <SellerShippingDashboard />
          )}

          {/* ===== EARNINGS & PAYOUTS TAB ===== */}


          {/* ===== EARNINGS & PAYOUTS TAB ===== */}
          {activeTab === 'earnings' && (
            <EarningsPayouts
              onNavigateToSettings={() => {
                window.location.href = '/settings';
              }}
            />
          )}

          {/* ===== MESSAGES TAB ===== */}
          {activeTab === 'messages' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
              <DashboardMessages onOpenMessages={handleOpenMessages} />
            </div>
          )}

          {/* ===== DISPUTES TAB ===== */}
          {activeTab === 'disputes' && (
            <DisputesList role="seller" />
          )}

          {/* ===== RATINGS TAB ===== */}
          {activeTab === 'ratings' && (
            <div className="space-y-6">
              {ratingSummary && ratingSummary.total > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="text-center">
                      <p className="text-5xl font-black text-gray-900">{ratingSummary.average}</p>
                      <div className="flex items-center gap-1 mt-2 justify-center">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className={`w-5 h-5 ${s <= Math.round(ratingSummary.average) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                        ))}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{ratingSummary.total} review{ratingSummary.total !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex-1 w-full space-y-2">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = ratingSummary.distribution?.[String(star)] || 0;
                        const pct = ratingSummary.total > 0 ? (count / ratingSummary.total) * 100 : 0;
                        return (
                          <div key={star} className="flex items-center gap-3">
                            <span className="text-sm text-gray-500 w-4 text-right">{star}</span>
                            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                            <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-8">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Review Analytics */}
              <ReviewAnalytics sellerId={user.id} />

              {ratings.length === 0 ? (

                <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                  <Star className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No ratings yet</h3>
                  <p className="text-gray-500 text-sm">Ratings from buyers will appear here after completed orders.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {ratings.map((r) => (
                    <div key={r.id} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{r.buyer_name_masked || 'Anonymous Buyer'}</p>
                            <p className="text-xs text-gray-500">{timeAgo(r.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} className={`w-4 h-4 ${s <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                          ))}
                        </div>
                      </div>
                      {r.review && <p className="text-sm text-gray-600 mt-3 pl-13">{r.review}</p>}
                      <p className="text-xs text-gray-400 mt-2 pl-13">For: {r.listing_title}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Edit Listing Modal */}
      <EditListingModal listing={editListing} isOpen={!!editListing} onClose={() => setEditListing(null)} onUpdated={handleListingUpdated} />

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

      {/* Sales Report Export Modal */}
      <SalesReportExport
        isOpen={showSalesReport}
        onClose={() => setShowSalesReport(false)}
      />
    </section>
  );
};


// ===== PollCourierButton - Bulk poll all shipped orders for tracking updates =====
const PollCourierButton: React.FC = () => {
  const [polling, setPolling] = useState(false);
  const [lastPolled, setLastPolled] = useState<string | null>(null);

  const handlePoll = async () => {
    setPolling(true);
    try {
      const result = await pollCourierTracking();
      const updated = result?.updated_count || result?.updated || 0;
      setLastPolled(new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }));
      toast({
        title: 'Courier Tracking Polled',
        description: updated > 0
          ? `${updated} shipment(s) updated with new tracking status.`
          : 'All shipments are up to date. No new updates.',
      });
    } catch (err: any) {
      toast({
        title: 'Polling Failed',
        description: err.message || 'Could not poll courier tracking. Try again later.',
        variant: 'destructive',
      });
    } finally {
      setPolling(false);
    }
  };

  return (
    <button
      onClick={handlePoll}
      disabled={polling}
      className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all disabled:opacity-50"
      title={lastPolled ? `Last polled: ${lastPolled}` : 'Poll all shipped orders for courier updates'}
    >
      {polling ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Satellite className="w-3.5 h-3.5" />
      )}
      {polling ? 'Polling...' : 'Poll Couriers'}
    </button>
  );
};

// ===== Helper Components =====

const StatCard: React.FC<{ icon: React.ReactNode; iconBg: string; label: string; value: string; sub?: string }> = ({ icon, iconBg, label, value, sub }) => (
  <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>{icon}</div>
    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
    <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

const MiniStat: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
    <p className={`text-xl font-bold ${color}`}>{value}</p>
    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
  </div>
);

export default SellerDashboard;

