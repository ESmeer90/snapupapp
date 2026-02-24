import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { playNotificationSoundIfEnabled } from '@/lib/notification-sound';
import { useSwipeToClose } from '@/hooks/useSwipeToClose';

import {
  Bell, MessageSquare, Package, TrendingDown, Tag, Check, CheckCheck,
  X, Loader2, Trash2, ChevronRight, ShoppingBag, AlertTriangle, Star,
  ChevronDown, ChevronUp
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

interface GroupedNotification {
  key: string;
  notifications: Notification[];
  latest: Notification;
  count: number;
  isExpanded: boolean;
}

interface NotificationBellProps {
  onViewChange: (view: string) => void;
}

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  new_message: <MessageSquare className="w-4 h-4" />,
  message: <MessageSquare className="w-4 h-4" />,
  order_update: <Package className="w-4 h-4" />,
  order: <Package className="w-4 h-4" />,
  price_drop: <TrendingDown className="w-4 h-4" />,
  price_alert: <TrendingDown className="w-4 h-4" />,
  new_offer: <Tag className="w-4 h-4" />,
  offer: <Tag className="w-4 h-4" />,
  review: <Star className="w-4 h-4" />,
  dispute: <AlertTriangle className="w-4 h-4" />,
  purchase: <ShoppingBag className="w-4 h-4" />,
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

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

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

function getGroupingKey(notif: Notification): string {
  const data = notif.data || {};
  switch (notif.type) {
    case 'new_message':
    case 'message': {
      const senderId = data.sender_id || '';
      const listingId = data.listing_id || '';
      if (senderId && listingId) return `msg:${senderId}:${listingId}`;
      if (senderId) return `msg:${senderId}`;
      return `single:${notif.id}`;
    }
    case 'order_update':
    case 'order':
    case 'purchase': {
      const orderId = data.order_id || '';
      if (orderId) return `order:${orderId}`;
      return `single:${notif.id}`;
    }
    case 'price_drop':
    case 'price_alert': {
      const listingId = data.listing_id || '';
      if (listingId) return `price:${listingId}`;
      return `single:${notif.id}`;
    }
    case 'new_offer':
    case 'offer': {
      const listingId = data.listing_id || '';
      if (listingId) return `offer:${listingId}`;
      return `single:${notif.id}`;
    }
    default:
      return `single:${notif.id}`;
  }
}

function buildGroupedNotifications(notifications: Notification[]): GroupedNotification[] {
  const groupMap = new Map<string, Notification[]>();
  const groupOrder: string[] = [];

  for (const notif of notifications) {
    const key = getGroupingKey(notif);
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
      groupOrder.push(key);
    }
    groupMap.get(key)!.push(notif);
  }

  return groupOrder.map(key => {
    const items = groupMap.get(key)!;
    return {
      key,
      notifications: items,
      latest: items[0],
      count: items.length,
      isExpanded: false,
    };
  });
}

function getGroupTitle(group: GroupedNotification): string {
  if (group.count === 1) return group.latest.title;

  const data = group.latest.data || {};
  const type = group.latest.type;

  if (type === 'new_message' || type === 'message') {
    const senderName = data.sender_name || group.latest.title.replace('New message from ', '');
    const listingTitle = data.listing_title || '';
    if (listingTitle) {
      return `${senderName} sent ${group.count} messages about ${listingTitle}`;
    }
    return `${senderName} sent ${group.count} messages`;
  }

  if (type === 'order_update' || type === 'order') {
    return `${group.count} updates on order`;
  }

  if (type === 'price_drop' || type === 'price_alert') {
    return `${group.count} price updates`;
  }

  if (type === 'new_offer' || type === 'offer') {
    return `${group.count} offers received`;
  }

  return group.latest.title;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ onViewChange }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const isInitialLoadRef = useRef(true);

  // Swipe-to-close for mobile notification panel (swipe right to dismiss)
  const notifSwipe = useSwipeToClose({
    onClose: () => setIsOpen(false),
    direction: 'right',
    threshold: 80,
  });


  // Lock body scroll when mobile panel is open
  useEffect(() => {
    if (isOpen) {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        document.body.style.overflow = 'hidden';
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      const notifs = (data || []) as Notification[];
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.is_read).length);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [user]);

  // Fetch unread count only
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (!error && count !== null) {
        setUnreadCount(count);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user) {
      fetchUnreadCount();
      isInitialLoadRef.current = false;
    } else {
      setNotifications([]);
      setUnreadCount(0);
      isInitialLoadRef.current = true;
    }
  }, [user, fetchUnreadCount]);

  // Real-time subscription with sound
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notifications-bell-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev].slice(0, 50));
          setUnreadCount(prev => prev + 1);

          if (!isInitialLoadRef.current) {
            playNotificationSoundIfEnabled(user.id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications(prev => {
            const newList = prev.map(n => n.id === updated.id ? updated : n);
            setUnreadCount(newList.filter(n => !n.is_read).length);
            return newList;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Fetch full list when dropdown opens
  useEffect(() => {
    if (isOpen && user) {
      setLoading(true);
      fetchNotifications().finally(() => setLoading(false));
    }
  }, [isOpen, user, fetchNotifications]);

  // Close dropdown on outside click (desktop only)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Only handle outside clicks for desktop dropdown
      if (window.innerWidth < 768) return;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Mark single notification as read
  const markAsRead = async (notifId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notifId);

      setNotifications(prev =>
        prev.map(n => n.id === notifId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  // Mark group as read
  const markGroupAsRead = async (group: GroupedNotification) => {
    const unreadIds = group.notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);

      setNotifications(prev =>
        prev.map(n => unreadIds.includes(n.id) ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - unreadIds.length));
    } catch (err) {
      console.error('Failed to mark group as read:', err);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    if (!user || markingAll) return;
    setMarkingAll(true);
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  // Delete notification
  const deleteNotification = async (notifId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const notif = notifications.find(n => n.id === notifId);
      await supabase
        .from('notifications')
        .delete()
        .eq('id', notifId);

      setNotifications(prev => prev.filter(n => n.id !== notifId));
      if (notif && !notif.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    const view = getNotificationView(notification);
    if (view) {
      onViewChange(view);
    }
    setIsOpen(false);
  };

  // Handle group click
  const handleGroupClick = (group: GroupedNotification) => {
    markGroupAsRead(group);
    const view = getNotificationView(group.latest);
    if (view) {
      onViewChange(view);
    }
    setIsOpen(false);
  };

  // Toggle group expansion
  const toggleGroupExpand = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!user) return null;

  const getIcon = (type: string) => NOTIFICATION_ICONS[type] || <Bell className="w-4 h-4" />;
  const getColor = (type: string) => NOTIFICATION_COLORS[type] || 'bg-gray-100 text-gray-600';

  const grouped = buildGroupedNotifications(notifications);

  // Shared notification list content (used by both mobile and desktop)
  const renderNotificationList = () => (
    <>
      {loading && notifications.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
            <Bell className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">No notifications yet</p>
          <p className="text-xs text-gray-400 mt-1 text-center">
            You'll see updates about messages, orders, and price drops here
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {grouped.map((group) => {
            const isMulti = group.count > 1;
            const isExpanded = expandedGroups.has(group.key);
            const hasUnread = group.notifications.some(n => !n.is_read);

            return (
              <div key={group.key}>
                {/* Group Header / Single Notification */}
                <button
                  onClick={() => isMulti && !isExpanded ? toggleGroupExpand(group.key, { stopPropagation: () => {} } as React.MouseEvent) : handleGroupClick(group)}
                  className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-all group/item hover:bg-gray-50 active:bg-gray-100 ${
                    hasUnread ? 'bg-blue-50/40' : ''
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${getColor(group.latest.type)}`}>
                    {getIcon(group.latest.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-snug ${hasUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {isMulti ? getGroupTitle(group) : group.latest.title}
                      </p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {hasUnread && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full" />
                        )}
                        {isMulti && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-full">
                            {group.count}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className={`text-xs mt-0.5 line-clamp-2 ${hasUnread ? 'text-gray-600' : 'text-gray-500'}`}>
                      {group.latest.message}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] text-gray-400">
                        {timeAgo(group.latest.created_at)}
                      </span>
                      <div className="flex items-center gap-1">
                        {isMulti && (
                          <button
                            onClick={(e) => toggleGroupExpand(group.key, e)}
                            className="flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-blue-500 transition-colors"
                          >
                            {isExpanded ? (
                              <>Collapse <ChevronUp className="w-3 h-3" /></>
                            ) : (
                              <>Show all <ChevronDown className="w-3 h-3" /></>
                            )}
                          </button>
                        )}
                        {!isMulti && getNotificationView(group.latest) && (
                          <span className="flex items-center gap-0.5 text-[11px] text-blue-500 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            View <ChevronRight className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Delete (single only) */}
                  {!isMulti && (
                    <button
                      onClick={(e) => deleteNotification(group.latest.id, e)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover/item:opacity-100 transition-all flex-shrink-0"
                      title="Remove notification"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </button>

                {/* Expanded Group Items */}
                {isMulti && isExpanded && (
                  <div className="bg-gray-50/50 border-t border-gray-100">
                    {group.notifications.map((notif, idx) => (
                      <button
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`w-full text-left pl-16 pr-4 py-2.5 flex items-start gap-2 transition-all group/sub hover:bg-gray-100 active:bg-gray-200 ${
                          !notif.is_read ? 'bg-blue-50/30' : ''
                        } ${idx < group.notifications.length - 1 ? 'border-b border-gray-100/50' : ''}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs leading-tight ${!notif.is_read ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                            {notif.title}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">
                            {notif.message}
                          </p>
                          <span className="text-[10px] text-gray-400">
                            {timeAgo(notif.created_at)}
                          </span>
                        </div>
                        {!notif.is_read && (
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                        )}
                        <button
                          onClick={(e) => deleteNotification(notif.id, e)}
                          className="p-1 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover/sub:opacity-100 transition-all flex-shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div className="relative notification-bell-container">
      {/* Bell Button */}
      <button
        ref={bellRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2.5 rounded-xl transition-all relative flex-shrink-0 ${
          isOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
        }`}
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-red-500 text-white rounded-full animate-pulse shadow-sm pointer-events-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ============ MOBILE: Full-screen overlay panel with swipe-to-close ============ */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 notif-mobile-panel" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          {/* Backdrop - fades with swipe */}
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${!notifSwipe.isSwiping ? 'notif-backdrop-animate' : ''}`}
            onClick={() => setIsOpen(false)}
            style={notifSwipe.backdropStyle}
          />

          {/* Panel - follows finger during swipe right */}
          <div
            className={`relative flex flex-col bg-white w-full h-full ${!notifSwipe.isSwiping ? 'notif-panel-animate' : ''}`}
            style={notifSwipe.panelStyle}
            onTouchStart={notifSwipe.handleTouchStart}
            onTouchMove={notifSwipe.handleTouchMove}
            onTouchEnd={notifSwipe.handleTouchEnd}
          >
            {/* Swipe indicator bar */}
            <div className="flex justify-center pt-2 pb-0 flex-shrink-0">
              <div className="w-8 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Mobile Header */}
            <div
              className="flex items-center justify-between px-4 py-3.5 border-b border-gray-200 bg-white flex-shrink-0"
              style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
            >
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-600 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    disabled={markingAll}
                    className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 active:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                    title="Mark all as read"
                  >
                    {markingAll ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCheck className="w-3.5 h-3.5" />
                    )}
                    <span>Read all</span>
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors"
                  aria-label="Close notifications"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mobile Scrollable Content */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 16px))' }}
            >
              {renderNotificationList()}
            </div>

            {/* Mobile Footer */}
            {notifications.length > 0 && (
              <div
                className="flex-shrink-0 border-t border-gray-200 px-4 py-3 bg-white"
                style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 16px))' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => {
                      onViewChange('notifications');
                      setIsOpen(false);
                    }}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-700 active:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    View all
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ============ DESKTOP: Dropdown panel ============ */}
      {isOpen && (
        <>
          {/* Desktop backdrop (invisible click-catcher) */}
          <div className="hidden md:block fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div
            ref={dropdownRef}
            className="hidden md:block absolute right-0 top-full mt-2 w-[400px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden notif-desktop-animate"
            style={{ maxHeight: 'min(560px, calc(100vh - 120px))' }}
          >
            {/* Desktop Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-600 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    disabled={markingAll}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Mark all as read"
                  >
                    {markingAll ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCheck className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Mark all read</span>
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Desktop Notification List */}
            <div className="overflow-y-auto" style={{ maxHeight: 'min(440px, calc(100vh - 220px))' }}>
              {renderNotificationList()}
            </div>

            {/* Desktop Footer */}
            {notifications.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50/50">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                    {grouped.length < notifications.length && (
                      <span className="ml-1">in {grouped.length} group{grouped.length !== 1 ? 's' : ''}</span>
                    )}
                  </span>
                  <button
                    onClick={() => {
                      onViewChange('notifications');
                      setIsOpen(false);
                    }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    View all
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
