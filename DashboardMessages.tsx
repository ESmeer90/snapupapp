import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getMessages, buildConversations, timeAgo } from '@/lib/api';
import type { Conversation } from '@/types';
import {
  MessageSquare, Loader2, User, ChevronRight, Inbox,
  RefreshCw, Shield, Search
} from 'lucide-react';

interface DashboardMessagesProps {
  onOpenMessages: () => void;
}

const DashboardMessages: React.FC<DashboardMessagesProps> = ({ onOpenMessages }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getMessages(user.id);
      const convs = buildConversations(data, user.id);
      setConversations(convs);
    } catch {
      // Silently fail in dashboard context
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Real-time updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('dashboard-messages-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const newMsg = payload.new as any;
        if (newMsg.sender_id === user.id || newMsg.receiver_id === user.id) {
          loadConversations();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, loadConversations]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  const filteredConversations = searchFilter
    ? conversations.filter(c =>
        c.other_user_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        c.listing_title.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : conversations;

  if (!user) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            Buyer Messages
          </h3>
          {totalUnread > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full animate-pulse">
              {totalUnread} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadConversations}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onOpenMessages}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            Open Chat <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* POPIA Notice */}
      <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
        <Shield className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">Messages are POPIA-compliant. Buyer identities are protected.</p>
      </div>

      {/* Search */}
      {conversations.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-4 py-2 bg-gray-100 border-0 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      )}

      {/* Conversations List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-600 mb-1">No messages yet</p>
            <p className="text-xs text-gray-400">When buyers message you about your listings, they'll appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
            {filteredConversations.map((conv) => (
              <button
                key={conv.conversation_id}
                onClick={onOpenMessages}
                className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 transition-colors text-left group"
              >
                {conv.listing_image ? (
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 relative">
                    <img src={conv.listing_image} alt="" className="w-full h-full object-cover" />
                    {conv.unread_count > 0 && (
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-600 rounded-full border border-white" />
                    )}
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 relative">
                    <User className="w-5 h-5 text-blue-600" />
                    {conv.unread_count > 0 && (
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-600 rounded-full border border-white" />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${conv.unread_count > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {conv.other_user_name}
                    </p>
                    <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(conv.last_message_at)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{conv.listing_title}</p>
                  <p className={`text-xs truncate mt-0.5 ${conv.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                    {conv.last_message_sender_id === user.id && <span className="text-gray-400">You: </span>}
                    {conv.last_message}
                  </p>
                </div>
                {conv.unread_count > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-bold bg-blue-600 text-white rounded-full flex-shrink-0 min-w-[18px] text-center self-center">
                    {conv.unread_count}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0 self-center" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      {conversations.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-gray-900">{conversations.length}</p>
            <p className="text-xs text-gray-500">Chats</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-blue-600">{totalUnread}</p>
            <p className="text-xs text-gray-500">Unread</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-emerald-600">
              {conversations.reduce((sum, c) => sum + c.total_messages, 0)}
            </p>
            <p className="text-xs text-gray-500">Messages</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardMessages;
