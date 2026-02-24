import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { supabase } from '@/lib/supabase';
import {
  getMessages, getConversationMessages, sendMessage, markMessagesAsRead, markMessagesAsDelivered,
  buildConversations, formatZAR, timeAgo, uploadMessageImage, createLocalPreview, revokeLocalPreview,
  getListing, fetchUserRatingsBatch, getOffersForConversation, createOffer
} from '@/lib/api';
import type { Conversation, Message, Listing, Offer } from '@/types';
import type { UserRatingInfo } from '@/lib/api';
import {
  validateMessage, recordSentMessage, getRateLimitRemaining, reportMessage,
  type SpamCheckResult, type SpamCheckSeverity
} from '@/lib/spam-filter';
import {
  MessageSquare, Loader2, User, Send, ArrowLeft, RefreshCw,
  AlertTriangle, Shield, Search, Check, CheckCheck, Inbox, Smile, X,
  Paperclip, Image as ImageIcon, Camera, ExternalLink, ShoppingBag, Info, Star,
  Flag, AlertCircle, ShieldAlert, Ban, Clock, Tag
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import ImageLightbox from './ImageLightbox';
import MessageInfoModal from './MessageInfoModal';
import ChatListingCard, { GeneralChatHeader } from './ChatListingCard';
import OfferCard from './OfferCard';
import MakeOfferModal from './MakeOfferModal';


// ==========================================
// SELLER RATING BADGE COMPONENT
// ==========================================
const SellerRatingBadge: React.FC<{ avgRating?: number; totalRatings?: number; compact?: boolean }> = ({ avgRating, totalRatings, compact = false }) => {
  if (!avgRating || !totalRatings || totalRatings === 0) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded-md text-[10px] font-medium text-amber-700 leading-none flex-shrink-0">
        <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
        {avgRating}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded-md text-[10px] font-medium text-amber-700 leading-none flex-shrink-0">
      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
      <span>{avgRating}</span>
      <span className="text-amber-500">({totalRatings})</span>
    </span>
  );
};

// ==========================================
// REPORT REASON OPTIONS
// ==========================================
const REPORT_REASONS = [
  { value: 'spam' as const, label: 'Spam', icon: Ban },
  { value: 'scam' as const, label: 'Scam / Fraud', icon: ShieldAlert },
  { value: 'contact_info' as const, label: 'Sharing contact info', icon: AlertCircle },
  { value: 'harassment' as const, label: 'Harassment', icon: AlertTriangle },
  { value: 'inappropriate' as const, label: 'Inappropriate content', icon: Flag },
  { value: 'other' as const, label: 'Other', icon: Info },
];

// ==========================================
// SPAM WARNING BANNER COMPONENT
// ==========================================
const SpamWarningBanner: React.FC<{
  result: SpamCheckResult;
  onDismiss: () => void;
  onSendAnyway?: () => void;
}> = ({ result, onDismiss, onSendAnyway }) => {
  if (!result.userMessage) return null;

  const isBlock = result.severity === 'block';
  const bgColor = isBlock ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';
  const textColor = isBlock ? 'text-red-800' : 'text-amber-800';
  const iconColor = isBlock ? 'text-red-500' : 'text-amber-500';
  const Icon = isBlock ? Ban : AlertTriangle;

  return (
    <div className={`mx-3 mb-2 p-3 rounded-xl border ${bgColor} animate-in slide-in-from-bottom-2 duration-200`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${textColor} mb-0.5`}>
            {isBlock ? 'Message Blocked' : 'Warning'}
          </p>
          <p className={`text-xs ${textColor} opacity-90 leading-relaxed`}>
            {result.userMessage}
          </p>
          {result.rule === 'blocked_content' && (
            <p className="text-[10px] text-gray-500 mt-1.5 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              SnapUp Buyer Protection keeps transactions safe on-platform
            </p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className={`p-1 rounded-md hover:bg-black/5 flex-shrink-0 ${textColor} opacity-60 hover:opacity-100 transition-opacity`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {!isBlock && onSendAnyway && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-amber-200/50">
          <button
            onClick={onSendAnyway}
            className="text-xs font-medium text-amber-700 hover:text-amber-900 px-2 py-1 rounded-md hover:bg-amber-100 transition-colors"
          >
            Send anyway
          </button>
          <button
            onClick={onDismiss}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
          >
            Edit message
          </button>
        </div>
      )}
    </div>
  );
};

// ==========================================
// REPORT MESSAGE MODAL
// ==========================================
const ReportMessageModal: React.FC<{
  message: Message;
  reporterId: string;
  onClose: () => void;
}> = ({ message, reporterId, onClose }) => {
  const [selectedReason, setSelectedReason] = useState<string>('spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    const result = await reportMessage({
      messageId: message.id,
      reporterId,
      reason: selectedReason as any,
      details: details.trim() || undefined,
    });
    setSubmitting(false);

    if (result.success) {
      setSubmitted(true);
      setTimeout(onClose, 1500);
    } else {
      toast({
        title: 'Report failed',
        description: result.error || 'Could not submit report. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {submitted ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Report Submitted</h3>
            <p className="text-sm text-gray-500">Thank you for helping keep SnapUp safe. Our team will review this message.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <Flag className="w-4 h-4 text-red-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900">Report Message</h3>
              </div>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message Preview */}
            <div className="mx-5 mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Message from {message.sender_name || 'User'}:</p>
              <p className="text-sm text-gray-700 line-clamp-3">{message.content || '(Image only)'}</p>
            </div>

            {/* Reason Selection */}
            <div className="px-5 py-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Why are you reporting this?</p>
              <div className="space-y-1.5">
                {REPORT_REASONS.map(({ value, label, icon: ReasonIcon }) => (
                  <button
                    key={value}
                    onClick={() => setSelectedReason(value)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                      selectedReason === value
                        ? 'bg-red-50 border-2 border-red-300 text-red-800'
                        : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <ReasonIcon className={`w-4 h-4 flex-shrink-0 ${selectedReason === value ? 'text-red-500' : 'text-gray-400'}`} />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Details */}
            <div className="px-5 pb-3">
              <textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="Add more details (optional)..."
                maxLength={500}
                rows={2}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-300 outline-none resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ==========================================
// UNIFIED TIMELINE ITEM TYPE
// ==========================================
type TimelineItem =
  | { type: 'message'; data: Message; created_at: string }
  | { type: 'offer'; data: Offer; created_at: string };

// ==========================================
// MAIN COMPONENT
// ==========================================
const MAX_MESSAGES_PER_MINUTE = 5;


interface MessagesViewProps {
  initialChat?: { listingId: string; sellerId: string; sellerName: string; listingTitle: string; listingImage?: string } | null;
  onClearInitialChat?: () => void;
  onViewListing?: (listing: Listing) => void;
  onBuyNow?: (listing: Listing) => void;
}

const MessagesView: React.FC<MessagesViewProps> = ({ initialChat, onClearInitialChat, onViewListing, onBuyNow }) => {
  const { user } = useAuth();
  const { refreshUnreadCount } = useChat();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [popiaVisible, setPopiaVisible] = useState(true);
  // Image attachment state
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState<string>('');
  // Message info modal state
  const [infoMessage, setInfoMessage] = useState<{ message: Message; isMine: boolean } | null>(null);
  // User ratings map
  const [userRatings, setUserRatings] = useState<Record<string, UserRatingInfo>>({});

  // ===== SPAM FILTER STATE =====
  const [spamWarning, setSpamWarning] = useState<SpamCheckResult | null>(null);
  const [pendingWarnMessage, setPendingWarnMessage] = useState<string | null>(null);
  const [reportingMessage, setReportingMessage] = useState<Message | null>(null);
  const [reportedMessageIds, setReportedMessageIds] = useState<Set<string>>(new Set());

  // ===== OFFER STATE =====
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [showMakeOffer, setShowMakeOffer] = useState(false);
  const [chatListing, setChatListing] = useState<Listing | null>(null);
  const [hasPendingOffer, setHasPendingOffer] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load all conversations
  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getMessages(user.id);
      const convs = buildConversations(data, user.id);
      setConversations(convs);

      // Batch-fetch ratings for all other users in conversations
      const otherUserIds = convs.map(c => c.other_user_id);
      if (otherUserIds.length > 0) {
        const ratings = await fetchUserRatingsBatch(otherUserIds);
        setUserRatings(ratings);
        // Enrich conversations with rating data
        setConversations(prev => prev.map(c => ({
          ...c,
          other_user_avg_rating: ratings[c.other_user_id]?.avg_rating,
          other_user_total_ratings: ratings[c.other_user_id]?.total_ratings,
        })));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);


  // Handle initial chat from listing detail
  useEffect(() => {
    if (initialChat && user && !loading) {
      const existingConv = conversations.find(
        c => c.listing_id === initialChat.listingId && c.other_user_id === initialChat.sellerId
      );
      if (existingConv) {
        setActiveConv(existingConv);
      } else {
        setActiveConv({
          conversation_id: `${initialChat.listingId}_${initialChat.sellerId}`,
          listing_id: initialChat.listingId,
          other_user_id: initialChat.sellerId,
          other_user_name: initialChat.sellerName,
          listing_title: initialChat.listingTitle,
          listing_image: initialChat.listingImage,
          last_message: '',
          last_message_at: new Date().toISOString(),
          last_message_sender_id: '',
          unread_count: 0,
          total_messages: 0,
        });
      }
      onClearInitialChat?.();
    }
  }, [initialChat, user, loading, conversations, onClearInitialChat]);

  // Determine buyer/seller IDs for the current conversation
  const getConversationRoles = useCallback(() => {
    if (!user || !activeConv) return { buyerId: '', sellerId: '' };
    // If we have the listing, the seller is the listing owner
    if (chatListing) {
      const sellerId = chatListing.user_id;
      const buyerId = sellerId === user.id ? activeConv.other_user_id : user.id;
      return { buyerId, sellerId };
    }
    // Fallback: assume the other user is the seller (since chats are typically initiated by buyers)
    return { buyerId: user.id, sellerId: activeConv.other_user_id };
  }, [user, activeConv, chatListing]);

  // Load chat messages and offers when conversation is selected
  useEffect(() => {
    if (!activeConv || !user) return;
    const loadChat = async () => {
      setChatLoading(true);
      setOffers([]);
      setChatListing(null);
      try {
        // Load messages
        const msgs = await getConversationMessages(activeConv.listing_id, user.id, activeConv.other_user_id);
        setChatMessages(msgs);

        // Load listing data for role determination
        try {
          const listing = await getListing(activeConv.listing_id);
          setChatListing(listing);
        } catch {}

        // Mark messages as delivered and read
        await markMessagesAsDelivered(user.id, activeConv.listing_id, activeConv.other_user_id).catch(() => {});
        if (activeConv.unread_count > 0) {
          await markMessagesAsRead(user.id, activeConv.listing_id, activeConv.other_user_id);
          setConversations(prev => prev.map(c =>
            c.conversation_id === activeConv.conversation_id ? { ...c, unread_count: 0 } : c
          ));
          refreshUnreadCount();
        }
        // Update local message state with delivered/read timestamps
        const now = new Date().toISOString();
        setChatMessages(prev => prev.map(m => {
          if (m.receiver_id === user.id && m.sender_id === activeConv.other_user_id) {
            return { ...m, delivered_at: m.delivered_at || now, is_read: true, read_at: m.read_at || now };
          }
          return m;
        }));
      } catch (err: any) {
        toast({ title: 'Error', description: 'Failed to load chat', variant: 'destructive' });
      } finally {
        setChatLoading(false);
      }
    };
    loadChat();
    setTimeout(() => textareaRef.current?.focus(), 150);
  }, [activeConv, user]);

  // Load offers once we know the roles (after chatListing loads)
  useEffect(() => {
    if (!activeConv || !user || !chatListing) return;
    const loadOffers = async () => {
      setOffersLoading(true);
      try {
        const { buyerId, sellerId } = getConversationRoles();
        if (buyerId && sellerId) {
          const offerData = await getOffersForConversation(activeConv.listing_id, buyerId, sellerId);
          setOffers(offerData);
          // Check if current user has a pending offer
          const pending = offerData.some(o => o.buyer_id === user.id && o.status === 'pending');
          setHasPendingOffer(pending);
        }
      } catch (err) {
        console.warn('Failed to load offers:', err);
      } finally {
        setOffersLoading(false);
      }
    };
    loadOffers();
  }, [activeConv, user, chatListing, getConversationRoles]);


  // Scroll to bottom helper
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior });
      }
    });
  }, []);

  // Scroll to bottom on new messages or offers
  useEffect(() => {
    scrollToBottom('smooth');
  }, [chatMessages, offers, scrollToBottom]);

  // Instant scroll on chat load
  useLayoutEffect(() => {
    if (!chatLoading && chatMessages.length > 0) {
      scrollToBottom('instant' as ScrollBehavior);
    }
  }, [chatLoading]);

  // Real-time subscription for new messages and status updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('chat-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const newMsg = payload.new as any;
        if (newMsg.sender_id !== user.id && newMsg.receiver_id !== user.id) return;

        if (activeConv && newMsg.listing_id === activeConv.listing_id) {
          const otherUserId = activeConv.other_user_id;
          if (newMsg.sender_id === otherUserId || newMsg.sender_id === user.id) {
            setChatMessages(prev => {
              if (prev.find(m => m.id === newMsg.id)) return prev;
              return [...prev, { ...newMsg, sender_name: newMsg.sender_id === user.id ? 'You' : activeConv.other_user_name }];
            });
            if (newMsg.sender_id === otherUserId) {
              markMessagesAsDelivered(user.id, activeConv.listing_id, otherUserId).catch(() => {});
              markMessagesAsRead(user.id, activeConv.listing_id, otherUserId);
              refreshUnreadCount();
              setIsTyping(false);
            }
          }
        }
        loadConversations();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const updated = payload.new as any;
        if (updated.sender_id !== user.id) return;
        // Update local message state with delivery/read confirmations
        setChatMessages(prev => prev.map(m =>
          m.id === updated.id
            ? { ...m, delivered_at: updated.delivered_at, is_read: updated.is_read, read_at: updated.read_at }
            : m
        ));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, activeConv, loadConversations, refreshUnreadCount]);

  // ===== REAL-TIME OFFERS SUBSCRIPTION =====
  useEffect(() => {
    if (!user || !activeConv) return;
    const offersChannel = supabase
      .channel('offers-realtime-' + activeConv.conversation_id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'offers',
        filter: `listing_id=eq.${activeConv.listing_id}`,
      }, (payload) => {
        const offerData = payload.new as any;
        if (!offerData) return;

        // Only process offers relevant to this conversation
        const isRelevant =
          (offerData.buyer_id === user.id && offerData.seller_id === activeConv.other_user_id) ||
          (offerData.seller_id === user.id && offerData.buyer_id === activeConv.other_user_id);
        if (!isRelevant) return;

        if (payload.eventType === 'INSERT') {
          setOffers(prev => {
            if (prev.find(o => o.id === offerData.id)) return prev;
            return [...prev, offerData];
          });
          // Update pending offer status
          if (offerData.buyer_id === user.id && offerData.status === 'pending') {
            setHasPendingOffer(true);
          }
          // Show toast for new offers from other user
          if (offerData.buyer_id !== user.id) {
            toast({
              title: 'New Offer Received',
              description: `${formatZAR(offerData.amount)} offer on this listing`,
            });
          }
        } else if (payload.eventType === 'UPDATE') {
          setOffers(prev => prev.map(o =>
            o.id === offerData.id ? { ...o, ...offerData } : o
          ));
          // Update pending offer status
          if (offerData.buyer_id === user.id) {
            setHasPendingOffer(offerData.status === 'pending');
          }
          // Show toast for status changes from other user
          if (
            (offerData.seller_id !== user.id && offerData.status === 'countered') ||
            (offerData.buyer_id !== user.id && offerData.status === 'accepted')
          ) {
            const statusLabel = offerData.status === 'accepted' ? 'Offer Accepted!' : 'Counter Offer Received';
            toast({
              title: statusLabel,
              description: offerData.status === 'accepted'
                ? `Deal agreed at ${formatZAR(offerData.counter_amount || offerData.amount)}`
                : `Seller countered with ${formatZAR(offerData.counter_amount)}`,
            });
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(offersChannel); };
  }, [user, activeConv]);


  // Typing indicator
  useEffect(() => {
    if (!user || !activeConv) return;
    const channelName = `typing-${[activeConv.listing_id, user.id, activeConv.other_user_id].sort().join('-')}`;
    const typingChannel = supabase.channel(channelName)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.user_id !== user.id) {
          setIsTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(typingChannel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [user, activeConv]);

  const broadcastTyping = useCallback(() => {
    if (!user || !activeConv) return;
    const channelName = `typing-${[activeConv.listing_id, user.id, activeConv.other_user_id].sort().join('-')}`;
    supabase.channel(channelName).send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: user.id },
    }).catch(() => {});
  }, [user, activeConv]);

  // ==========================================
  // IMAGE ATTACHMENT HANDLERS
  // ==========================================
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file (JPG, PNG, WebP)', variant: 'destructive' });
      return;
    }

    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please select an image under 10MB', variant: 'destructive' });
      return;
    }

    // Create preview
    const preview = createLocalPreview(file);
    setPendingImage(file);
    setPendingImagePreview(preview);

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearPendingImage = () => {
    if (pendingImagePreview) {
      revokeLocalPreview(pendingImagePreview);
    }
    setPendingImage(null);
    setPendingImagePreview(null);
  };

  // ==========================================
  // SEND MESSAGE WITH SPAM FILTER
  // ==========================================
  const doSendMessage = async (content: string, bypassWarning: boolean = false) => {
    if (!user || !activeConv || sending) return;
    const hasImage = !!pendingImage;
    const hasText = content.length > 0;

    if (!hasImage && !hasText) return;

    if (content.length > 2000) {
      toast({ title: 'Error', description: 'Message too long (max 2000 characters)', variant: 'destructive' });
      return;
    }

    // ===== SPAM FILTER VALIDATION =====
    if (hasText && !bypassWarning) {
      const spamResult = validateMessage(user.id, content);
      
      if (!spamResult.allowed) {
        // Blocked — show warning, don't send
        setSpamWarning(spamResult);
        return;
      }
      
      if (spamResult.severity === 'warn') {
        // Warning — show warning, allow "send anyway"
        setSpamWarning(spamResult);
        setPendingWarnMessage(content);
        return;
      }
    }

    // Clear any previous warnings
    setSpamWarning(null);
    setPendingWarnMessage(null);

    setSending(true);
    setNewMessage('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    let uploadedImageUrl: string | null = null;

    try {
      // Upload image if present
      if (pendingImage) {
        setImageUploading(true);
        try {
          uploadedImageUrl = await uploadMessageImage(pendingImage);
        } catch (uploadErr: any) {
          toast({ title: 'Image upload failed', description: uploadErr.message || 'Could not upload image', variant: 'destructive' });
          setNewMessage(content);
          setSending(false);
          setImageUploading(false);
          return;
        }
        setImageUploading(false);
        clearPendingImage();
      }

      // Send message
      const messageContent = hasText ? content : (uploadedImageUrl ? '' : '');
      const sent = await sendMessage(
        activeConv.listing_id,
        user.id,
        activeConv.other_user_id,
        messageContent,
        uploadedImageUrl
      );

      // Record for rate limiting
      recordSentMessage(user.id);

      setChatMessages(prev => [...prev, { ...sent, sender_name: 'You' }]);

      const lastMsgPreview = uploadedImageUrl && !hasText
        ? '📷 Photo'
        : uploadedImageUrl && hasText
          ? `📷 ${content}`
          : content;

      setConversations(prev => {
        const updated = prev.map(c =>
          c.conversation_id === activeConv.conversation_id
            ? { ...c, last_message: lastMsgPreview, last_message_at: sent.created_at, last_message_sender_id: user.id, total_messages: c.total_messages + 1 }
            : c
        );
        if (!prev.find(c => c.conversation_id === activeConv.conversation_id)) {
          updated.unshift({ ...activeConv, last_message: lastMsgPreview, last_message_at: sent.created_at, last_message_sender_id: user.id, total_messages: 1 });
        }
        return updated.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
      });
    } catch (err: any) {
      setNewMessage(content);
      toast({ title: 'Error', description: err.message || 'Failed to send message', variant: 'destructive' });
    } finally {
      setSending(false);
      setImageUploading(false);
      textareaRef.current?.focus();
    }
  };

  const handleSend = async () => {
    const content = newMessage.trim();
    await doSendMessage(content, false);
  };

  const handleSendAnyway = async () => {
    if (pendingWarnMessage) {
      const msg = pendingWarnMessage;
      setPendingWarnMessage(null);
      setSpamWarning(null);
      await doSendMessage(msg, true);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    broadcastTyping();
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    // Clear spam warning when user edits
    if (spamWarning) {
      setSpamWarning(null);
      setPendingWarnMessage(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ==========================================
  // OFFER HANDLERS
  // ==========================================
  const handleMakeOfferFromCard = (listing: Listing) => {
    setChatListing(listing);
    setShowMakeOffer(true);
  };

  const handleMakeOfferSubmit = async (amount: number, message?: string) => {
    if (!user || !activeConv || !chatListing) throw new Error('Missing context');

    const { buyerId, sellerId } = getConversationRoles();
    if (user.id !== buyerId) {
      throw new Error('Only the buyer can make an offer');
    }

    // Create the offer
    const offer = await createOffer({
      listing_id: activeConv.listing_id,
      buyer_id: buyerId,
      seller_id: sellerId,
      amount,
      message,
    });

    // Add to local offers
    setOffers(prev => [...prev, { ...offer, buyer_name: user.email || 'You', seller_name: activeConv.other_user_name }]);
    setHasPendingOffer(true);

    // Send a notification message in chat
    const offerMsg = `💰 I've made an offer of ${formatZAR(amount)} on this listing.${message ? ` "${message}"` : ''}`;
    try {
      const sent = await sendMessage(
        activeConv.listing_id,
        user.id,
        activeConv.other_user_id,
        offerMsg
      );
      setChatMessages(prev => [...prev, { ...sent, sender_name: 'You' }]);
    } catch {}

    toast({
      title: 'Offer Sent!',
      description: `Your offer of ${formatZAR(amount)} has been sent to the seller.`,
    });
  };

  const handleOfferUpdated = (updatedOffer: Offer) => {
    setOffers(prev => prev.map(o => o.id === updatedOffer.id ? { ...o, ...updatedOffer } : o));
    // Update pending offer status
    if (user && updatedOffer.buyer_id === user.id) {
      setHasPendingOffer(updatedOffer.status === 'pending');
    }
  };

  const handleAcceptAndBuy = async (acceptedOffer: Offer) => {
    if (!chatListing) return;

    // Determine the agreed price
    const agreedPrice = acceptedOffer.counter_amount || acceptedOffer.amount;

    // Send a notification message
    if (user && activeConv) {
      try {
        const acceptMsg = `✅ Offer accepted! Deal agreed at ${formatZAR(agreedPrice)}.`;
        const sent = await sendMessage(
          activeConv.listing_id,
          user.id,
          activeConv.other_user_id,
          acceptMsg
        );
        setChatMessages(prev => [...prev, { ...sent, sender_name: 'You' }]);
      } catch {}
    }

    // Determine if current user is the buyer
    const { buyerId } = getConversationRoles();
    const isBuyerAccepting = user?.id === buyerId;

    if (isBuyerAccepting && onBuyNow) {
      // Buyer accepted a counter-offer → trigger checkout at agreed price
      const listingAtOfferPrice: Listing = {
        ...chatListing,
        price: agreedPrice,
      };
      onBuyNow(listingAtOfferPrice);
    } else if (!isBuyerAccepting) {
      // Seller accepted buyer's offer → notify buyer to proceed
      toast({
        title: 'Offer Accepted!',
        description: `Deal agreed at ${formatZAR(agreedPrice)}. The buyer will be notified to complete the purchase.`,
      });
    }
  };


  const filteredConversations = searchFilter
    ? conversations.filter(c =>
        c.other_user_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        c.listing_title.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : conversations;

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  if (!user) return null;

  const formatChatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`;
    return `${d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const quickReplies = [
    'Hi, is this still available?',
    'What is the lowest price?',
    'Can I collect today?',
    'Can you deliver?',
  ];

  const handleCloseChat = () => {
    setActiveConv(null);
    setIsTyping(false);
    setChatMessages([]);
    setOffers([]);
    setChatListing(null);
    setHasPendingOffer(false);
    setShowMakeOffer(false);
    setNewMessage('');
    clearPendingImage();
    setSpamWarning(null);
    setPendingWarnMessage(null);
  };

  // ==========================================
  // REPORT HANDLER
  // ==========================================
  const handleReportMessage = (msg: Message) => {
    setReportingMessage(msg);
  };

  const handleReportClose = () => {
    if (reportingMessage) {
      setReportedMessageIds(prev => new Set(prev).add(reportingMessage.id));
    }
    setReportingMessage(null);
  };

  // ==========================================
  // BUILD UNIFIED TIMELINE
  // ==========================================
  const buildTimeline = useCallback((): TimelineItem[] => {
    const items: TimelineItem[] = [];

    // Add messages
    for (const msg of chatMessages) {
      items.push({ type: 'message', data: msg, created_at: msg.created_at });
    }

    // Add offers
    for (const offer of offers) {
      items.push({ type: 'offer', data: offer, created_at: offer.created_at });
    }

    // Sort by created_at
    items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return items;
  }, [chatMessages, offers]);

  // ==========================================
  // MESSAGE BUBBLE WITH IMAGE SUPPORT + REPORT BUTTON
  // ==========================================
  const renderMessageBubble = (msg: Message, isMine: boolean) => {
    const hasImage = !!msg.image_url;
    const hasText = !!msg.content && msg.content.trim().length > 0;
    const isReported = reportedMessageIds.has(msg.id);

    return (
      <div className={`max-w-[85%] sm:max-w-[70%] group relative`}>
        <div
          className={`overflow-hidden ${
            isMine
              ? 'bg-blue-600 text-white rounded-2xl rounded-br-md shadow-sm'
              : 'bg-white text-gray-800 rounded-2xl rounded-bl-md border border-gray-200 shadow-sm'
          }`}
        >
          {/* Image */}
          {hasImage && (
            <button
              onClick={() => {
                setLightboxSrc(msg.image_url!);
                setLightboxAlt(msg.content || 'Shared image');
              }}
              className="block w-full cursor-pointer group/img relative"
            >
              <img
                src={msg.image_url!}
                alt={msg.content || 'Shared image'}
                className="w-full max-h-64 object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm rounded-full p-2">
                  <ImageIcon className="w-5 h-5 text-white" />
                </div>
              </div>
            </button>
          )}

          {/* Text caption */}
          {hasText && (
            <div
              className={`px-3.5 py-2.5 text-sm leading-relaxed ${hasImage ? 'pt-2' : ''}`}
              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
            >
              {msg.content}
            </div>
          )}

          {/* Image-only message with no text: add small padding */}
          {hasImage && !hasText && <div className="h-0.5" />}
        </div>

        {/* Timestamp + Report button row */}
        <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
          {/* Report button (only for other user's messages) */}
          {!isMine && (
            <button
              onClick={() => handleReportMessage(msg)}
              className={`opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-50 ${
                isReported ? 'opacity-100 text-red-400 cursor-default' : 'text-gray-300 hover:text-red-500'
              }`}
              disabled={isReported}
              title={isReported ? 'Message reported' : 'Report this message'}
            >
              <Flag className={`w-3 h-3 ${isReported ? 'fill-red-400' : ''}`} />
            </button>
          )}

          {/* Timestamp */}
          <button
            onClick={() => isMine && setInfoMessage({ message: msg, isMine })}
            className={`${isMine ? 'cursor-pointer' : 'cursor-default'}`}
            disabled={!isMine}
          >
            <span className="text-[10px] text-gray-400 leading-none">{formatChatTime(msg.created_at)}</span>
          </button>

          {/* Read receipts */}
          {isMine && (
            msg.is_read && msg.read_at
              ? <CheckCheck className="w-3 h-3 text-blue-500 flex-shrink-0" />
              : msg.delivered_at
                ? <CheckCheck className="w-3 h-3 text-gray-400 flex-shrink-0" />
                : <Check className="w-3 h-3 text-gray-400 flex-shrink-0" />
          )}
        </div>
      </div>
    );
  };

  const handleViewListingFromChat = async () => {
    if (!activeConv || !onViewListing) return;
    try {
      const listing = await getListing(activeConv.listing_id);
      if (listing) onViewListing(listing);
    } catch { }
  };


  // ==========================================
  // RATE LIMIT INDICATOR
  // ==========================================
  const rateLimitRemaining = user ? getRateLimitRemaining(user.id) : MAX_MESSAGES_PER_MINUTE;
  const showRateLimitIndicator = rateLimitRemaining <= 2 && rateLimitRemaining > 0;

  // ==========================================
  // CONVERSATION LIST (shared between layouts)
  // ==========================================
  const renderConversationList = (className?: string) => (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Search */}
      <div className="p-3 border-b border-gray-100 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-4 py-2.5 bg-gray-100 border-0 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Conversation Items */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        )}
        {!loading && error && (
          <div className="p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-red-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 mb-3">{error}</p>
            <button onClick={loadConversations} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Retry</button>
          </div>
        )}
        {!loading && !error && filteredConversations.length === 0 && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Inbox className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No conversations yet</p>
            <p className="text-xs text-gray-400">Start a chat from any listing page by clicking "Chat with Seller"</p>
          </div>
        )}
        {filteredConversations.map((conv) => (
          <button
            key={conv.conversation_id}
            onClick={() => setActiveConv(conv)}
            className={`w-full flex items-start gap-3 p-3.5 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left ${
              activeConv?.conversation_id === conv.conversation_id ? 'bg-blue-50 border-l-[3px] border-l-blue-600' : ''
            }`}
          >
            {conv.listing_image ? (
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 relative">
                <img src={conv.listing_image} alt="" className="w-full h-full object-cover" />
                {conv.unread_count > 0 && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                )}
              </div>
            ) : (
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 relative">
                <User className="w-6 h-6 text-blue-600" />
                {conv.unread_count > 0 && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className={`text-sm truncate ${conv.unread_count > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{conv.other_user_name}</p>
                  <SellerRatingBadge avgRating={conv.other_user_avg_rating} totalRatings={conv.other_user_total_ratings} compact />
                </div>
                <span className="text-[11px] text-gray-400 flex-shrink-0">{timeAgo(conv.last_message_at)}</span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">{conv.listing_title}</p>

              <div className="flex items-center justify-between gap-2 mt-1">
                <p className={`text-xs truncate ${conv.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                  {conv.last_message_sender_id === user.id && (
                    <span className="inline-flex items-center gap-0.5 mr-1">
                      <CheckCheck className="w-3 h-3 text-blue-400" />
                    </span>
                  )}
                  {conv.last_message}
                </p>
                {conv.unread_count > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full flex-shrink-0 min-w-[20px] text-center">
                    {conv.unread_count}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // ==========================================
  // CHAT WINDOW (shared between layouts)
  // ==========================================
  const renderChatWindow = (isMobileFullscreen: boolean = false) => {
    if (!activeConv) {
      return (
        <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
          <div className="text-center p-8">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-12 h-12 text-blue-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-1">Select a conversation</h3>
            <p className="text-sm text-gray-400 max-w-xs">Choose a chat from the list to start messaging, or start a new chat from any listing</p>
          </div>
        </div>
      );
    }

    // Build the unified timeline
    const timeline = buildTimeline();

    // Determine if current user is the buyer (can make offers)
    const { buyerId, sellerId } = getConversationRoles();
    const isBuyer = user.id === buyerId;
    const isSeller = user.id === sellerId;

    return (
      <div className="flex flex-col h-full">
        {/* ===== Chat Header ===== */}
        <div className="flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0 z-10">
          <button
            onClick={handleCloseChat}
            className={`p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ${isMobileFullscreen ? '' : 'md:hidden'}`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {activeConv.listing_image ? (
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
              <img src={activeConv.listing_image} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-blue-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-900 truncate">{activeConv.other_user_name}</p>
              <SellerRatingBadge
                avgRating={activeConv.other_user_avg_rating || userRatings[activeConv.other_user_id]?.avg_rating}
                totalRatings={activeConv.other_user_total_ratings || userRatings[activeConv.other_user_id]?.total_ratings}
              />
            </div>

            <p className="text-xs text-gray-500 truncate">
              {isTyping ? (
                <span className="text-blue-600 font-medium flex items-center gap-1">
                  typing
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </span>
              ) : (
                <>
                  Re: {activeConv.listing_title}
                  {activeConv.listing_price != null && ` — ${formatZAR(activeConv.listing_price)}`}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Make Offer button in header (buyer only, negotiable listings) */}
            {isBuyer && chatListing?.is_negotiable && chatListing?.status === 'active' && (
              <button
                onClick={() => setShowMakeOffer(true)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <Tag className="w-3 h-3" />
                Offer
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs text-gray-400 hidden sm:inline">Live</span>
            </div>
            <button onClick={loadConversations} disabled={loading} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ===== Product Context Card (FB Marketplace style) ===== */}
        {activeConv.listing_id ? (
          <ChatListingCard
            listingId={activeConv.listing_id}
            fallbackTitle={activeConv.listing_title}
            fallbackImage={activeConv.listing_image}
            fallbackPrice={activeConv.listing_price}
            onViewListing={onViewListing || undefined}
            onMakeOffer={isBuyer ? handleMakeOfferFromCard : undefined}
            compact={isMobileFullscreen}
          />
        ) : (
          <GeneralChatHeader />
        )}

        {/* ===== Messages Area ===== */}

        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3"
          style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)' }}
        >
          {chatLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          )}
          {!chatLoading && timeline.length === 0 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Smile className="w-8 h-8 text-blue-300" />
              </div>
              <p className="text-sm font-medium text-gray-600 mb-1">Start the conversation</p>
              <p className="text-xs text-gray-400 mb-4">Send a message or photo about this listing</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-sm mx-auto">
                {quickReplies.map((qr) => (
                  <button
                    key={qr}
                    onClick={() => { setNewMessage(qr); textareaRef.current?.focus(); }}
                    className="px-3 py-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-100"
                  >
                    {qr}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Unified Timeline: Messages + Offers interleaved */}
          <div className="space-y-1">
            {timeline.map((item, idx) => {
              const showDate = idx === 0 || new Date(item.created_at).toDateString() !== new Date(timeline[idx - 1].created_at).toDateString();

              if (item.type === 'offer') {
                const offer = item.data as Offer;
                return (
                  <React.Fragment key={`offer-${offer.id}`}>
                    {showDate && (
                      <div className="flex items-center justify-center py-3">
                        <span className="px-3 py-1 bg-white text-[11px] text-gray-400 rounded-full shadow-sm border border-gray-100 font-medium">
                          {new Date(item.created_at).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    )}
                    <OfferCard
                      offer={offer}
                      currentUserId={user.id}
                      listingTitle={chatListing?.title || activeConv.listing_title}
                      listingPrice={chatListing?.price ?? activeConv.listing_price}
                      onOfferUpdated={handleOfferUpdated}
                      onAcceptAndBuy={handleAcceptAndBuy}

                    />
                  </React.Fragment>
                );
              }

              // Message item
              const msg = item.data as Message;
              const isMine = msg.sender_id === user.id;
              return (
                <React.Fragment key={msg.id}>
                  {showDate && (
                    <div className="flex items-center justify-center py-3">
                      <span className="px-3 py-1 bg-white text-[11px] text-gray-400 rounded-full shadow-sm border border-gray-100 font-medium">
                        {new Date(msg.created_at).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}>
                    {renderMessageBubble(msg, isMine)}
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Image uploading indicator in chat */}
          {imageUploading && (
            <div className="flex justify-end mb-1">
              <div className="max-w-[85%] sm:max-w-[70%]">
                <div className="bg-blue-600 rounded-2xl rounded-br-md shadow-sm overflow-hidden">
                  <div className="w-48 h-32 bg-blue-500/50 flex items-center justify-center relative">
                    {pendingImagePreview && (
                      <img src={pendingImagePreview} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                    )}
                    <div className="relative z-10 flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                      <span className="text-xs text-white/80 font-medium">Uploading...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start mb-1">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-1" />
        </div>

        {/* Quick Replies (shown when chat has few messages) */}
        {chatMessages.length > 0 && chatMessages.length < 3 && (
          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 flex-shrink-0">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {quickReplies.slice(0, 3).map((qr) => (
                <button
                  key={qr}
                  onClick={() => { setNewMessage(qr); textareaRef.current?.focus(); }}
                  className="px-3 py-1 text-xs text-gray-600 bg-white hover:bg-blue-50 hover:text-blue-600 rounded-full transition-all border border-gray-200 whitespace-nowrap flex-shrink-0"
                >
                  {qr}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== Image Preview Strip ===== */}
        {pendingImagePreview && !imageUploading && (
          <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="relative group">
                <img
                  src={pendingImagePreview}
                  alt="Pending attachment"
                  className="w-16 h-16 object-cover rounded-lg border-2 border-blue-300 shadow-sm"
                />
                <button
                  onClick={clearPendingImage}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{pendingImage?.name}</p>
                <p className="text-[11px] text-gray-400">
                  {pendingImage && (pendingImage.size / 1024).toFixed(0)}KB
                  {' — will be compressed to max 1MB'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ===== SPAM WARNING BANNER ===== */}
        {spamWarning && spamWarning.userMessage && (
          <SpamWarningBanner
            result={spamWarning}
            onDismiss={() => { setSpamWarning(null); setPendingWarnMessage(null); }}
            onSendAnyway={spamWarning.severity === 'warn' ? handleSendAnyway : undefined}
          />
        )}

        {/* ===== Message Input Bar ===== */}
        <div
          className="flex-shrink-0 border-t border-gray-200 bg-white"
          style={{ paddingBottom: isMobileFullscreen ? 'max(0.75rem, env(safe-area-inset-bottom))' : '0.75rem' }}
        >
          <div className="px-3 pt-3">
            <div className="flex items-end gap-2">
              {/* Attachment button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || imageUploading}
                className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all disabled:opacity-40 flex-shrink-0"
                title="Attach image"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Make Offer button (mobile, inline with input) */}
              {isBuyer && chatListing?.is_negotiable && chatListing?.status === 'active' && isMobileFullscreen && (
                <button
                  onClick={() => setShowMakeOffer(true)}
                  className="p-2.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all flex-shrink-0"
                  title="Make an offer"
                >
                  <Tag className="w-5 h-5" />
                </button>
              )}

              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={pendingImage ? 'Add a caption (optional)...' : 'Type a message...'}
                maxLength={2000}
                rows={1}
                className="flex-1 px-4 py-2.5 bg-gray-100 border-0 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none leading-relaxed"
                style={{ maxHeight: '120px', minHeight: '42px' }}
                disabled={sending || imageUploading}
              />

              <button
                onClick={handleSend}
                disabled={(!newMessage.trim() && !pendingImage) || sending || imageUploading}
                className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 shadow-lg shadow-blue-200 active:scale-95"
              >
                {sending || imageUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>

            {/* Rate limit indicator + character count */}
            <div className="flex items-center justify-between mt-1 px-1">
              <div className="flex items-center gap-2">
                {showRateLimitIndicator && (
                  <span className="text-[10px] text-amber-600 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {rateLimitRemaining} message{rateLimitRemaining !== 1 ? 's' : ''} left this minute
                  </span>
                )}
              </div>
              {newMessage.length > 1800 && (
                <p className="text-[11px] text-amber-600">{2000 - newMessage.length} characters remaining</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================
  // MOBILE FULL-SCREEN CHAT OVERLAY
  // ==========================================
  if (activeConv) {
    // Determine roles for MakeOfferModal
    const { buyerId } = getConversationRoles();
    const isBuyerUser = user.id === buyerId;

    return (
      <>
        {/* Lightbox */}
        {lightboxSrc && (
          <ImageLightbox
            src={lightboxSrc}
            alt={lightboxAlt}
            onClose={() => { setLightboxSrc(null); setLightboxAlt(''); }}
          />
        )}

        {/* Message Info Modal */}
        {infoMessage && (
          <MessageInfoModal
            message={infoMessage.message}
            isMine={infoMessage.isMine}
            onClose={() => setInfoMessage(null)}
          />
        )}

        {/* Report Message Modal */}
        {reportingMessage && user && (
          <ReportMessageModal
            message={reportingMessage}
            reporterId={user.id}
            onClose={handleReportClose}
          />
        )}

        {/* Make Offer Modal */}
        {showMakeOffer && chatListing && isBuyerUser && (
          <MakeOfferModal
            isOpen={showMakeOffer}
            onClose={() => setShowMakeOffer(false)}
            onSubmit={handleMakeOfferSubmit}
            listingPrice={chatListing.price}
            listingTitle={chatListing.title}
            listingImage={chatListing.images?.[0]}
            hasPendingOffer={hasPendingOffer}
          />
        )}

        {/* Mobile: Full-screen overlay */}
        <div className="md:hidden fixed inset-0 z-50 bg-white flex flex-col" style={{ height: '100dvh' }}>
          {renderChatWindow(true)}
        </div>

        {/* Desktop: Split panel layout */}
        <div className="hidden md:block max-w-7xl mx-auto px-4 sm:px-6 py-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                Messages
                {totalUnread > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-blue-600 text-white rounded-full">{totalUnread}</span>
                )}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs text-gray-400">Live</span>
              </div>
              <button onClick={loadConversations} disabled={loading} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-200">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* POPIA Notice (desktop, dismissible) */}
          {popiaVisible && (
            <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl mb-3">
              <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 flex-1">Messages and images are stored securely per POPIA. Images are compressed before upload. Contact info sharing is blocked for your safety.</p>
              <button onClick={() => setPopiaVisible(false)} className="text-blue-400 hover:text-blue-600 flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}


          {/* Desktop split panel */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm" style={{ height: 'calc(100vh - 13rem)' }}>
            <div className="flex h-full">
              {/* Left: Conversation List */}
              <div className="w-96 border-r border-gray-200 flex-shrink-0">
                {renderConversationList()}
              </div>
              {/* Right: Chat Window */}
              <div className="flex-1 flex flex-col min-w-0">
                {renderChatWindow(false)}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }


  // ==========================================
  // NO ACTIVE CONVERSATION — show list
  // ==========================================
  return (
    <>
      {/* Lightbox (for when returning from a chat) */}
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt={lightboxAlt}
          onClose={() => { setLightboxSrc(null); setLightboxAlt(''); }}
        />
      )}

      {/* Report Message Modal */}
      {reportingMessage && user && (
        <ReportMessageModal
          message={reportingMessage}
          reporterId={user.id}
          onClose={handleReportClose}
        />
      )}

      {/* Mobile: Conversation list */}
      <div className="md:hidden">
        {/* Mobile Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              Messages
              {totalUnread > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold bg-blue-600 text-white rounded-full">{totalUnread}</span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs text-gray-400">Live</span>
              </div>
              <button onClick={loadConversations} disabled={loading} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* POPIA Notice (mobile, dismissible) */}
        {popiaVisible && (
          <div className="mx-4 mt-3">
            <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
              <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 flex-1">Messages and images are stored securely per POPIA. Do not share sensitive personal information.</p>
              <button onClick={() => setPopiaVisible(false)} className="text-blue-400 hover:text-blue-600 flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 border-0 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Conversation Items */}
        <div className="pb-24">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          )}
          {!loading && error && (
            <div className="p-6 text-center">
              <AlertTriangle className="w-10 h-10 text-red-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-3">{error}</p>
              <button onClick={loadConversations} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Retry</button>
            </div>
          )}
          {!loading && !error && filteredConversations.length === 0 && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Inbox className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">No conversations yet</p>
              <p className="text-xs text-gray-400">Start a chat from any listing page by clicking "Chat with Seller"</p>
            </div>
          )}
          {filteredConversations.map((conv) => (
            <button
              key={conv.conversation_id}
              onClick={() => setActiveConv(conv)}
              className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left active:bg-gray-100"
            >
              {conv.listing_image ? (
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 relative">
                  <img src={conv.listing_image} alt="" className="w-full h-full object-cover" />
                  {conv.unread_count > 0 && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                  )}
                </div>
              ) : (
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 relative">
                  <User className="w-6 h-6 text-blue-600" />
                  {conv.unread_count > 0 && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className={`text-sm truncate ${conv.unread_count > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{conv.other_user_name}</p>
                    <SellerRatingBadge avgRating={conv.other_user_avg_rating} totalRatings={conv.other_user_total_ratings} compact />
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">{timeAgo(conv.last_message_at)}</span>
                </div>

                <p className="text-xs text-gray-500 truncate mt-0.5">{conv.listing_title}</p>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <p className={`text-xs truncate ${conv.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                    {conv.last_message_sender_id === user.id && (
                      <span className="inline-flex items-center gap-0.5 mr-1">
                        <CheckCheck className="w-3 h-3 text-blue-400" />
                      </span>
                    )}
                    {conv.last_message}
                  </p>
                  {conv.unread_count > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full flex-shrink-0 min-w-[20px] text-center">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: Split panel with empty state */}
      <div className="hidden md:block max-w-7xl mx-auto px-4 sm:px-6 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              Messages
              {totalUnread > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold bg-blue-600 text-white rounded-full">{totalUnread}</span>
              )}
            </h2>
            <p className="text-gray-500 text-sm mt-0.5">Real-time conversations with buyers and sellers</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs text-gray-400">Live</span>
            </div>
            <button onClick={loadConversations} disabled={loading} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-200">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* POPIA Notice */}
        {popiaVisible && (
          <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl mb-3">
            <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 flex-1">Messages and images are stored securely per POPIA. Images are compressed before upload. Contact info sharing is blocked for your safety.</p>
            <button onClick={() => setPopiaVisible(false)} className="text-blue-400 hover:text-blue-600 flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Desktop split panel */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm" style={{ height: 'calc(100vh - 13rem)' }}>
          <div className="flex h-full">
            {/* Left: Conversation List */}
            <div className="w-96 border-r border-gray-200 flex-shrink-0">
              {renderConversationList()}
            </div>
            {/* Right: Empty state */}
            <div className="flex-1 flex flex-col min-w-0">
              {renderChatWindow(false)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MessagesView;
