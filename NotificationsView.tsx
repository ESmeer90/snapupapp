import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  Bell, MessageSquare, Package, TrendingDown, Tag, Check, CheckCheck,
  Trash2, Loader2, ChevronRight, ShoppingBag, AlertTriangle, Star,
  ChevronLeft, ChevronDown, Filter, X, ArrowLeft, Square, CheckSquare
} from 'lucide-react';

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  data: Record<string, any> | null;
  created_at: string;
}

interface NotificationsViewProps {
  onViewChange: (view: string) => void;
}

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  new_message: <MessageSquare className="w-5 h-5" />,
  message: <MessageSquare className="w-5 h-5" />,
  order_update: <Package className="w-5 h-5" />,
  order: <Package className="w-5 h-5" />,
  price_drop: <TrendingDown className="w-5 h-5" />,
  price_alert: <TrendingDown className="w-5 h-5" />,
  new_offer: <Tag className="w-5 h-5" />,
  offer: <Tag className="w-5 h-5" />,
  review: <Star className="w-5 h-5" />,
  dispute: <AlertTriangle className="w-5 h-5" />,
  purchase: <ShoppingBag className="w-5 h-5" />,
};

const NOTIFICATION_COLORS: Record<string, string> = {
  new_message: 'bg-blue-100 text-blue-600',
  message: 'bg-blue-100 text-blue-600',
  order_update: 'bg-emerald-100 text-emerald-600',
  order: 'bg-emerald-100 text-emerald-600',
  price_drop: 'bg-orange-100 text-orange-600',
  price_alert: 'bg-orange-100 text-orange-600',
  new_offer: 'bg-purple-100 text-purple-600',
  offer: 'bg-purple-100 text-purple-600',
  review: 'bg-amber-100 text-amber-600',
  dispute: 'bg-red-100 text-red-600',
  purchase: 'bg-indigo-100 text-indigo-600',
};

type FilterTab = 'all' | 'messages' | 'orders' | 'price_drops' | 'offers';

const FILTER_TABS: { id: FilterTab; label: string; icon: React.ReactNode; types: string[] }[] = [
  { id: 'all', label: 'All', icon: <Bell className="w-4 h-4" />, types: [] },
  { id: 'messages', label: 'Messages', icon: <MessageSquare className="w-4 h-4" />, types: ['new_message', 'message'] },
  { id: 'orders', label: 'Orders', icon: <Package className="w-4 h-4" />, types: ['order_update', 'order', 'purchase'] },
  { id: 'price_drops', label: 'Price Drops', icon: <TrendingDown className="w-4 h-4" />, types: ['price_drop', 'price_alert'] },
  { id: 'offers', label: 'Offers', icon: <Tag className="w-4 h-4" />, types: ['new_offer', 'offer'] },
];

const PAGE_SIZE = 20;

function getNotificationView(notification: Notification): string | null {
  const { type, link } = notification;
  if (link) {
    const viewNames = ['messages', 'orders', 'favorites', 'price-alerts', 'dashboard', 'my-listings', 'home'];
    if (viewNames.includes(link)) return link;
    for (const v of viewNames) {
      if (link.startsWith(v)) return v;
    }
  }
  switch (type) {
    case 'new_message': case 'message': return 'messages';
    case 'order_update': case 'order': case 'purchase': return 'orders';
    case 'price_drop': case 'price_alert': return 'price-alerts';
    case 'new_offer': case 'offer': return 'orders';
    case 'review': return 'dashboard';
    case 'dispute': return 'orders';
    default: return null;
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const notifDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (notifDay.getTime() >= today.getTime()) return 'Today';
  if (notifDay.getTime() >= yesterday.getTime()) return 'Yesterday';
  if (notifDay.getTime() >= weekAgo.getTime()) return 'This Week';
  return 'Older';
}

function groupByDate(notifications: Notification[]): { group: string; items: Notification[] }[] {
  const groups: Record<string, Notification[]> = {};
  const order = ['Today', 'Yesterday', 'This Week', 'Older'];

  for (const notif of notifications) {
    const group = getDateGroup(notif.created_at);
    if (!groups[group]) groups[group] = [];
    groups[group].push(notif);
  }

  return order.filter(g => groups[g]?.length).map(g => ({ group: g, items: groups[g] }));
}

const NotificationsView: React.FC<NotificationsViewProps> = ({ onViewChange }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const pageRef = useRef(0);

  const getTypeFilter = useCallback(() => {
    const tab = FILTER_TABS.find(t => t.id === activeTab);
    return tab?.types || [];
  }, [activeTab]);

  const fetchNotifications = useCallback(async (reset: boolean = true) => {
    if (!user) return;
    if (reset) {
      setLoading(true);
      pageRef.current = 0;
    } else {
      setLoadingMore(true);
    }

    try {
      const types = getTypeFilter();
      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(pageRef.current * PAGE_SIZE, (pageRef.current + 1) * PAGE_SIZE - 1);

      if (types.length > 0) {
        query = query.in('type', types);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const items = (data || []) as Notification[];
      if (reset) {
        setNotifications(items);
      } else {
        setNotifications(prev => [...prev, ...items]);
      }
      setTotalCount(count || 0);
      setHasMore(items.length >= PAGE_SIZE);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, getTypeFilter]);

  useEffect(() => {
    fetchNotifications(true);
  }, [fetchNotifications]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications-view-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const newNotif = payload.new as Notification;
        const types = getTypeFilter();
        if (types.length === 0 || types.includes(newNotif.type)) {
          setNotifications(prev => [newNotif, ...prev]);
          setTotalCount(prev => prev + 1);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const updated = payload.new as Notification;
        setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, getTypeFilter]);

  const handleLoadMore = () => {
    pageRef.current += 1;
    fetchNotifications(false);
  };

  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    setSelectedIds(new Set());
    pageRef.current = 0;
  };

  // Selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === notifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notifications.map(n => n.id)));
    }
  };

  // Bulk actions
  const bulkMarkRead = async () => {
    if (selectedIds.size === 0 || !user) return;
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedIds);
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', ids);

      setNotifications(prev =>
        prev.map(n => selectedIds.has(n.id) ? { ...n, is_read: true } : n)
      );
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Bulk mark read failed:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0 || !user) return;
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedIds);
      await supabase
        .from('notifications')
        .delete()
        .in('id', ids);

      setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)));
      setTotalCount(prev => prev - ids.length);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Bulk delete failed:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  const markAllRead = async () => {
    if (!user) return;
    setBulkLoading(true);
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Mark all read failed:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notification.id);

      setNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
      );
    }
    const view = getNotificationView(notification);
    if (view) onViewChange(view);
  };

  const getIcon = (type: string) => NOTIFICATION_ICONS[type] || <Bell className="w-5 h-5" />;
  const getColor = (type: string) => NOTIFICATION_COLORS[type] || 'bg-gray-100 text-gray-600';

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const dateGroups = groupByDate(notifications);
  const allSelected = notifications.length > 0 && selectedIds.size === notifications.length;

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onViewChange('home')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {totalCount} notification{totalCount !== 1 ? 's' : ''}
              {unreadCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-red-100 text-red-600 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-xl transition-colors disabled:opacity-50"
            >
              {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTER_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                  : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-blue-700">
              {selectedIds.size} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={bulkMarkRead}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors disabled:opacity-50"
            >
              {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Mark Read
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors disabled:opacity-50"
            >
              {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Delete
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Select All Toggle */}
      {notifications.length > 0 && (
        <div className="flex items-center gap-3 mb-3 px-1">
          <button
            onClick={selectAll}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            {allSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            Select all
          </button>
        </div>
      )}

      {/* Notification List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
          <p className="text-sm text-gray-500">Loading notifications...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Bell className="w-10 h-10 text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">No notifications</h3>
          <p className="text-sm text-gray-400 text-center max-w-sm">
            {activeTab === 'all'
              ? "You're all caught up! Notifications about messages, orders, and price drops will appear here."
              : `No ${FILTER_TABS.find(t => t.id === activeTab)?.label.toLowerCase()} notifications yet.`}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {dateGroups.map(({ group, items }) => (
            <div key={group}>
              {/* Date Group Header */}
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">{group}</h3>
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">{items.length}</span>
              </div>

              {/* Notifications in Group */}
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {items.map((notification) => {
                  const isSelected = selectedIds.has(notification.id);
                  return (
                    <div
                      key={notification.id}
                      className={`flex items-start gap-3 px-4 py-4 transition-all group cursor-pointer ${
                        !notification.is_read ? 'bg-blue-50/50' : 'hover:bg-gray-50'
                      } ${isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(notification.id); }}
                        className="mt-1 flex-shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />
                        )}
                      </button>

                      {/* Icon */}
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${getColor(notification.type)}`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        {getIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div
                        className="flex-1 min-w-0"
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm leading-tight ${
                            !notification.is_read ? 'font-bold text-gray-900' : 'font-medium text-gray-700'
                          }`}>
                            {notification.title}
                          </p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!notification.is_read && (
                              <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                            )}
                          </div>
                        </div>
                        <p className={`text-sm mt-1 line-clamp-2 ${
                          !notification.is_read ? 'text-gray-600' : 'text-gray-500'
                        }`}>
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-400">
                            {formatDate(notification.created_at)}
                          </span>
                          {getNotificationView(notification) && (
                            <span className="flex items-center gap-0.5 text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              Open <ChevronRight className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Delete */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await supabase.from('notifications').delete().eq('id', notification.id);
                          setNotifications(prev => prev.filter(n => n.id !== notification.id));
                          setTotalCount(prev => prev - 1);
                          selectedIds.delete(notification.id);
                          setSelectedIds(new Set(selectedIds));
                        }}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 mt-1"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                Load more notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsView;
