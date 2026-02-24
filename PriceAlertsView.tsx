import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatZAR, timeAgo } from '@/lib/api';
import {
  Bell, BellRing, BellOff, Loader2, Trash2, Edit3, Check, X, AlertCircle,
  TrendingDown, Package, Eye, Search, Filter, ChevronDown, RefreshCw, ArrowRight
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface EnrichedAlert {
  id: string;
  user_id: string;
  listing_id: string;
  target_price: number;
  is_active: boolean;
  triggered_at: string | null;
  notified_at: string | null;
  created_at: string;
  listing_title?: string;
  listing_price?: number;
  listing_image?: string;
  listing_status?: string;
}

interface PriceAlertsViewProps {
  onViewListing?: (listing: any) => void;
}

const PriceAlertsView: React.FC<PriceAlertsViewProps> = ({ onViewListing }) => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<EnrichedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'triggered'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load alerts using direct Supabase query (primary) or edge function (fallback)
  const loadAlerts = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setError('Please sign in to view your price alerts.');
      return;
    }
    
    setError(null);
    
    try {
      // PRIMARY METHOD: Direct Supabase query with RLS
      // This bypasses edge function auth issues entirely
      console.log('[PriceAlerts] Loading alerts via direct query for user:', user.id);
      
      const { data: alertsData, error: alertsError } = await supabase
        .from('price_alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (alertsError) {
        console.warn('[PriceAlerts] Direct query failed:', alertsError.message);
        throw new Error(alertsError.message);
      }

      console.log('[PriceAlerts] Direct query returned', (alertsData || []).length, 'alerts');

      // Enrich with listing data
      const rawAlerts = alertsData || [];
      const listingIds = [...new Set(rawAlerts.map(a => a.listing_id))];
      
      let listingsMap: Record<string, any> = {};
      if (listingIds.length > 0) {
        const { data: listings } = await supabase
          .from('listings')
          .select('id, title, price, images, status')
          .in('id', listingIds);
        
        for (const l of (listings || [])) {
          listingsMap[l.id] = l;
        }
      }

      const enriched: EnrichedAlert[] = rawAlerts.map(a => ({
        ...a,
        listing_title: listingsMap[a.listing_id]?.title,
        listing_price: listingsMap[a.listing_id]?.price,
        listing_image: listingsMap[a.listing_id]?.images?.[0],
        listing_status: listingsMap[a.listing_id]?.status,
      }));

      setAlerts(enriched);
      setError(null);
      console.log('[PriceAlerts] Successfully loaded', enriched.length, 'enriched alerts');
      
    } catch (directErr: any) {
      console.warn('[PriceAlerts] Direct query failed, trying edge function fallback:', directErr.message);
      
      // FALLBACK: Edge function (handles auth differently)
      try {
        // Ensure fresh session
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
            if (expiresAt > 0 && expiresAt - Date.now() < 60000) {
              await supabase.auth.refreshSession();
            }
          }
        } catch (e) {
          console.warn('[PriceAlerts] Session refresh check failed:', e);
        }
        
        const { data, error: fnError } = await supabase.functions.invoke('check-price-alerts', {
          body: { action: 'get-alerts' },
        });
        
        if (fnError) {
          // Try to extract specific error
          const specificError = data?.error;
          if (specificError) throw new Error(specificError);
          
          const errMsg = (fnError as any)?.message || String(fnError);
          if (errMsg.includes('non-2xx') || errMsg.includes('Edge Function')) {
            throw new Error('Price alerts service is temporarily unavailable. Please try again.');
          }
          throw new Error(errMsg || 'Failed to load price alerts');
        }
        
        if (data?.error) throw new Error(data.error);
        
        setAlerts(data?.alerts || []);
        setError(null);
        console.log('[PriceAlerts] Edge function fallback succeeded with', (data?.alerts || []).length, 'alerts');
        
      } catch (fallbackErr: any) {
        console.error('[PriceAlerts] Both methods failed:', fallbackErr.message);
        const msg = fallbackErr.message || 'Failed to load price alerts';
        setError(msg);
        
        if (refreshing) {
          toast({ title: 'Error', description: msg, variant: 'destructive' });
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, refreshing]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const handleRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    loadAlerts();
  };

  // Delete alert using direct query (primary) or edge function (fallback)
  const handleDelete = async (alertId: string) => {
    setDeletingId(alertId);
    try {
      // PRIMARY: Direct delete with RLS
      const { error: delError } = await supabase
        .from('price_alerts')
        .delete()
        .eq('id', alertId);
      
      if (delError) {
        console.warn('[PriceAlerts] Direct delete failed:', delError.message);
        // FALLBACK: Edge function
        const { data, error: fnError } = await supabase.functions.invoke('check-price-alerts', {
          body: { action: 'delete-alert', alert_id: alertId },
        });
        if (fnError) {
          const specificError = data?.error;
          throw new Error(specificError || (fnError as any)?.message || 'Failed to delete alert');
        }
        if (data?.error) throw new Error(data.error);
      }
      
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      toast({ title: 'Alert removed', description: 'Price alert has been deleted.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to delete alert', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartEdit = (alert: EnrichedAlert) => {
    setEditingId(alert.id);
    setEditPrice(String(alert.target_price));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditPrice('');
  };

  // Update alert using edge function (needs cross-table validation)
  const handleSaveEdit = async (alert: EnrichedAlert) => {
    const price = parseFloat(editPrice);
    if (!price || price <= 0) {
      toast({ title: 'Invalid price', description: 'Please enter a valid target price', variant: 'destructive' });
      return;
    }
    if (alert.listing_price && price >= alert.listing_price) {
      toast({ title: 'Price too high', description: 'Target price should be below the current listing price', variant: 'destructive' });
      return;
    }

    setSavingId(alert.id);
    try {
      // Try direct update first
      const { error: updateError } = await supabase
        .from('price_alerts')
        .update({ 
          target_price: price, 
          is_active: true, 
          triggered_at: null,
          updated_at: new Date().toISOString() 
        })
        .eq('id', alert.id);
      
      if (updateError) {
        console.warn('[PriceAlerts] Direct update failed, trying edge function:', updateError.message);
        // Fallback to edge function
        const { data, error: fnError } = await supabase.functions.invoke('check-price-alerts', {
          body: { action: 'upsert-alert', listing_id: alert.listing_id, target_price: price },
        });
        if (fnError) {
          const specificError = data?.error;
          throw new Error(specificError || (fnError as any)?.message || 'Failed to update alert');
        }
        if (data?.error) throw new Error(data.error);
        
        if (data?.already_met) {
          toast({ title: 'Price already met!', description: `Current price is already at or below ${formatZAR(price)}` });
        } else {
          toast({ title: 'Alert updated', description: `Target price updated to ${formatZAR(price)}` });
        }
      } else {
        // Check if price is already met
        const alreadyMet = alert.listing_price ? alert.listing_price <= price : false;
        if (alreadyMet) {
          toast({ title: 'Price already met!', description: `Current price is already at or below ${formatZAR(price)}` });
        } else {
          toast({ title: 'Alert updated', description: `Target price updated to ${formatZAR(price)}` });
        }
      }

      setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, target_price: price, is_active: true, triggered_at: null } : a));
      setEditingId(null);
      setEditPrice('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update alert', variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const handleViewListing = async (alert: EnrichedAlert) => {
    if (!onViewListing) return;
    try {
      const { data } = await supabase
        .from('listings')
        .select('*, profiles!listings_user_id_fkey(full_name, avatar_url), categories(name, slug, icon)')
        .eq('id', alert.listing_id)
        .single();
      if (data) {
        const listing = {
          ...data,
          seller_name: (data as any).profiles?.full_name,
          seller_avatar: (data as any).profiles?.avatar_url,
          category_name: (data as any).categories?.name,
          category_slug: (data as any).categories?.slug,
          category_icon: (data as any).categories?.icon,
        };
        onViewListing(listing);
      }
    } catch {
      toast({ title: 'Error', description: 'Could not load listing', variant: 'destructive' });
    }
  };

  const filteredAlerts = alerts.filter(a => {
    if (filter === 'active') return a.is_active;
    if (filter === 'triggered') return !a.is_active && a.triggered_at;
    return true;
  });

  const activeCount = alerts.filter(a => a.is_active).length;
  const triggeredCount = alerts.filter(a => !a.is_active && a.triggered_at).length;
  const recentlyTriggered = alerts.filter(a => {
    if (!a.triggered_at) return false;
    const triggeredDate = new Date(a.triggered_at);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return triggeredDate > weekAgo;
  });

  if (loading) {
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-500 font-medium">Loading price alerts...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <BellRing className="w-5 h-5 text-white" />
            </div>
            Price Alerts
          </h1>
          <p className="text-gray-500 text-sm mt-1">Get notified when prices drop to your target</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Unable to load price alerts</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
              {error.includes('session') || error.includes('sign in') || error.includes('Unauthorized') ? (
                <p className="text-xs text-red-500 mt-2">
                  Try signing out and signing back in to refresh your session.
                </p>
              ) : null}
            </div>
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mb-2">
            <Bell className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{alerts.length}</p>
          <p className="text-xs text-gray-500">Total Alerts</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center mb-2">
            <BellRing className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
          <p className="text-xs text-gray-500">Active</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center mb-2">
            <TrendingDown className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{triggeredCount}</p>
          <p className="text-xs text-gray-500">Triggered</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center mb-2">
            <AlertCircle className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{recentlyTriggered.length}</p>
          <p className="text-xs text-gray-500">This Week</p>
        </div>
      </div>

      {/* Recently Triggered Banner */}
      {recentlyTriggered.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-emerald-800">Recently Triggered Alerts</h3>
          </div>
          <div className="space-y-2">
            {recentlyTriggered.slice(0, 3).map(alert => (
              <div key={alert.id} className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-white border border-emerald-200 overflow-hidden flex-shrink-0">
                  {alert.listing_image ? (
                    <img src={alert.listing_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-gray-300" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-emerald-800 font-medium truncate">{alert.listing_title || 'Listing'}</p>
                  <p className="text-emerald-600 text-xs">
                    Price dropped to {alert.listing_price ? formatZAR(alert.listing_price) : 'target'} 
                    {alert.triggered_at && ` - ${timeAgo(alert.triggered_at)}`}
                  </p>
                </div>
                <button
                  onClick={() => handleViewListing(alert)}
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1 flex-shrink-0"
                >
                  View <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 mb-4 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
        {[
          { id: 'all' as const, label: 'All', count: alerts.length },
          { id: 'active' as const, label: 'Active', count: activeCount },
          { id: 'triggered' as const, label: 'Triggered', count: triggeredCount },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
              filter === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              filter === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Alerts List */}
      {filteredAlerts.length === 0 && !error ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BellOff className="w-10 h-10 text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            {filter === 'all' ? 'No price alerts yet' : filter === 'active' ? 'No active alerts' : 'No triggered alerts'}
          </h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            {filter === 'all'
              ? 'Set price alerts on listings you\'re interested in. We\'ll email you when the price drops to your target.'
              : filter === 'active'
              ? 'All your alerts have been triggered or removed.'
              : 'None of your alerts have been triggered yet. Keep watching!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map(alert => {
            const isEditing = editingId === alert.id;
            const isSaving = savingId === alert.id;
            const isDeleting = deletingId === alert.id;
            const currentPrice = alert.listing_price || 0;
            const priceDiff = currentPrice - alert.target_price;
            const pricePct = currentPrice > 0 ? Math.round((priceDiff / currentPrice) * 100) : 0;
            const isTriggered = !alert.is_active && alert.triggered_at;
            const isMet = currentPrice > 0 && currentPrice <= alert.target_price;
            const isSold = alert.listing_status === 'sold' || alert.listing_status === 'archived';

            return (
              <div
                key={alert.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
                  isTriggered ? 'border-emerald-200' : isSold ? 'border-gray-200 opacity-60' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-4 p-4">
                  {/* Listing Image */}
                  <button
                    onClick={() => handleViewListing(alert)}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 hover:opacity-80 transition-opacity"
                  >
                    {alert.listing_image ? (
                      <img src={alert.listing_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                  </button>

                  {/* Alert Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          onClick={() => handleViewListing(alert)}
                          className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors truncate block text-left"
                        >
                          {alert.listing_title || 'Listing'}
                        </button>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {isTriggered ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-semibold">
                              <Check className="w-3 h-3" /> Triggered
                            </span>
                          ) : isSold ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 rounded-full text-[10px] font-semibold">
                              Sold / Archived
                            </span>
                          ) : isMet ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-semibold">
                              <TrendingDown className="w-3 h-3" /> Price Met!
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-semibold">
                              <Bell className="w-3 h-3" /> Watching
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">
                            Set {timeAgo(alert.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {alert.is_active && !isEditing && (
                          <button
                            onClick={() => handleStartEdit(alert)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit target price"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(alert.id)}
                          disabled={isDeleting}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete alert"
                        >
                          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Price Comparison */}
                    <div className="mt-3 flex items-center gap-4 flex-wrap">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-medium">Current Price</p>
                        <p className={`text-sm font-bold ${isMet || isTriggered ? 'text-emerald-600' : 'text-gray-900'}`}>
                          {currentPrice > 0 ? formatZAR(currentPrice) : 'N/A'}
                        </p>
                      </div>
                      <div className="text-gray-300">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-medium">Target Price</p>
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">R</span>
                              <input
                                type="number"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                className="w-28 pl-6 pr-2 py-1.5 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                autoFocus
                              />
                            </div>
                            <button
                              onClick={() => handleSaveEdit(alert)}
                              disabled={isSaving}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-blue-600">{formatZAR(alert.target_price)}</p>
                        )}
                      </div>
                      {!isEditing && currentPrice > 0 && priceDiff > 0 && (
                        <div className="hidden sm:block">
                          <p className="text-[10px] text-gray-400 uppercase font-medium">Difference</p>
                          <p className="text-sm font-medium text-gray-500">
                            {formatZAR(priceDiff)} ({pricePct}% off)
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Triggered info */}
                    {isTriggered && alert.triggered_at && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                        <Check className="w-3.5 h-3.5" />
                        Triggered {timeAgo(alert.triggered_at)}
                        {alert.notified_at && ' - Email sent'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default PriceAlertsView;
