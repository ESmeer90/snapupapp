import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Mail, Loader2, Search, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Clock, BarChart3, TrendingUp, Zap, ChevronDown, ChevronUp,
  Send, Activity, ArrowUpRight, ArrowDownRight, Play, RotateCcw, Eye, X,
  Code, ExternalLink, Bookmark, MousePointerClick, MailOpen, ShieldAlert,
  Timer, Ban, Globe, Link2, Inbox
} from 'lucide-react';

import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { timeAgo, resendEmail } from '@/lib/api';

interface EmailLog {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  error: string | null;
  email_id: string | null;
  order_id: string | null;
  tracking_status: string | null;
  event_type: string | null;
  provider: string | null;
  email_body: string | null;
  delivery_status: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  bounce_type: string | null;
  bounce_reason: string | null;
  deferred_at: string | null;
  delivered_at: string | null;
  dropped_at: string | null;
  drop_reason: string | null;
  click_url: string | null;
  user_agent: string | null;
  last_event_at: string | null;
  created_at: string;
}

interface EmailStats {
  total_sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  opened: number;
  clicked: number;
  bounced: number;
  deferred: number;
  sg_delivered: number;
  open_rate: number;
  click_rate: number;
  by_event_type: Record<string, number> | null;
  by_delivery_status: Record<string, number> | null;
  daily_volume: Array<{ date: string; count: number; sent: number; failed: number; opened: number; clicked: number; bounced: number }> | null;
  dispatch_stats: {
    total: number;
    dispatched: number;
    pending: number;
    failed: number;
  };
}

interface CronLog {
  id: string;
  job_name: string;
  status: string;
  result: any;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  order_confirmed: { label: 'Order Confirmed', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: <CheckCircle2 className="w-3 h-3" /> },
  new_order_seller: { label: 'New Order (Seller)', color: 'text-blue-700', bg: 'bg-blue-100', icon: <Send className="w-3 h-3" /> },
  tracking_update: { label: 'Tracking Update', color: 'text-purple-700', bg: 'bg-purple-100', icon: <Activity className="w-3 h-3" /> },
  delivery_confirmed: { label: 'Delivery Confirmed', color: 'text-teal-700', bg: 'bg-teal-100', icon: <CheckCircle2 className="w-3 h-3" /> },
  payment_received: { label: 'Payment Received', color: 'text-amber-700', bg: 'bg-amber-100', icon: <ArrowUpRight className="w-3 h-3" /> },
  dispute_resolved: { label: 'Dispute Resolved', color: 'text-indigo-700', bg: 'bg-indigo-100', icon: <CheckCircle2 className="w-3 h-3" /> },
  payout_rejected: { label: 'Payout Rejected', color: 'text-red-700', bg: 'bg-red-100', icon: <XCircle className="w-3 h-3" /> },
  saved_search_alert: { label: 'Saved Search Alert', color: 'text-cyan-700', bg: 'bg-cyan-100', icon: <Bookmark className="w-3 h-3" /> },
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  sent: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-600" />,
  skipped: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
  pending: <Clock className="w-3.5 h-3.5 text-gray-400" />,
};

const DELIVERY_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  processed: { label: 'Processed', color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200', icon: <Inbox className="w-3 h-3 text-slate-500" /> },
  delivered: { label: 'Delivered', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <CheckCircle2 className="w-3 h-3 text-emerald-600" /> },
  opened: { label: 'Opened', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: <MailOpen className="w-3 h-3 text-blue-600" /> },
  clicked: { label: 'Clicked', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', icon: <MousePointerClick className="w-3 h-3 text-violet-600" /> },
  bounced: { label: 'Bounced', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: <ShieldAlert className="w-3 h-3 text-red-600" /> },
  dropped: { label: 'Dropped', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: <Ban className="w-3 h-3 text-red-600" /> },
  deferred: { label: 'Deferred', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: <Timer className="w-3 h-3 text-amber-600" /> },
  spam_reported: { label: 'Spam', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', icon: <ShieldAlert className="w-3 h-3 text-rose-600" /> },
  unsubscribed: { label: 'Unsubscribed', color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', icon: <Ban className="w-3 h-3 text-gray-500" /> },
};

// ─── Email Content Preview Modal ────────────────────────────────────────────
const EmailContentModal: React.FC<{
  log: EmailLog | null;
  onClose: () => void;
}> = ({ log, onClose }) => {
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (log?.email_body && iframeRef.current && viewMode === 'preview') {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(log.email_body);
        doc.close();
      }
    }
  }, [log, viewMode]);

  if (!log) return null;

  const hasBody = !!log.email_body;
  const dsConfig = log.delivery_status ? DELIVERY_STATUS_CONFIG[log.delivery_status] : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-lg truncate">Email Content</h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {log.recipient}
              </span>
              <span>{new Date(log.created_at).toLocaleString('en-ZA')}</span>
              {log.event_type && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  EVENT_TYPE_LABELS[log.event_type]?.bg || 'bg-gray-100'
                } ${EVENT_TYPE_LABELS[log.event_type]?.color || 'text-gray-700'}`}>
                  {EVENT_TYPE_LABELS[log.event_type]?.label || log.event_type}
                </span>
              )}
              {dsConfig && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${dsConfig.bg} ${dsConfig.color} ${dsConfig.border}`}>
                  {dsConfig.icon}
                  {dsConfig.label}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {hasBody && (
              <div className="flex items-center bg-gray-200 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('preview')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    viewMode === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Eye className="w-3 h-3 inline mr-1" />
                  Preview
                </button>
                <button
                  onClick={() => setViewMode('source')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    viewMode === 'source' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Code className="w-3 h-3 inline mr-1" />
                  Source
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Meta info bar */}
        <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-gray-400 font-medium">Subject</span>
            <p className="text-gray-900 font-semibold truncate mt-0.5">{log.subject || '(no subject)'}</p>
          </div>
          <div>
            <span className="text-gray-400 font-medium">Status</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {STATUS_ICONS[log.status] || STATUS_ICONS.pending}
              <span className={`font-semibold capitalize ${
                log.status === 'sent' ? 'text-emerald-700' :
                log.status === 'failed' ? 'text-red-700' :
                log.status === 'skipped' ? 'text-amber-700' : 'text-gray-500'
              }`}>{log.status}</span>
            </div>
          </div>
          <div>
            <span className="text-gray-400 font-medium">Provider</span>
            <p className="text-gray-900 font-semibold capitalize mt-0.5">{log.provider || 'N/A'}</p>
          </div>
          <div>
            <span className="text-gray-400 font-medium">Order</span>
            <p className="text-gray-900 font-semibold font-mono mt-0.5">
              {log.order_id ? `#${log.order_id.slice(0, 8)}` : 'N/A'}
            </p>
          </div>
        </div>

        {/* Delivery tracking timeline */}
        {(log.delivered_at || log.opened_at || log.clicked_at || log.bounced_at || log.deferred_at) && (
          <div className="px-6 py-3 bg-gradient-to-r from-blue-50/50 to-violet-50/50 border-b border-gray-100">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Delivery Timeline</p>
            <div className="flex items-center gap-3 flex-wrap text-[11px]">
              {log.delivered_at && (
                <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />
                  Delivered {timeAgo(log.delivered_at)}
                </span>
              )}
              {log.opened_at && (
                <span className="flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
                  <MailOpen className="w-3 h-3" />
                  Opened {timeAgo(log.opened_at)}
                </span>
              )}
              {log.clicked_at && (
                <span className="flex items-center gap-1 text-violet-700 bg-violet-50 px-2 py-1 rounded-lg border border-violet-200">
                  <MousePointerClick className="w-3 h-3" />
                  Clicked {timeAgo(log.clicked_at)}
                </span>
              )}
              {log.bounced_at && (
                <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2 py-1 rounded-lg border border-red-200">
                  <ShieldAlert className="w-3 h-3" />
                  Bounced {timeAgo(log.bounced_at)}
                  {log.bounce_type && <span className="text-[9px] opacity-75">({log.bounce_type})</span>}
                </span>
              )}
              {log.deferred_at && (
                <span className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                  <Timer className="w-3 h-3" />
                  Deferred {timeAgo(log.deferred_at)}
                </span>
              )}
              {log.click_url && (
                <span className="flex items-center gap-1 text-gray-500 text-[10px]">
                  <Link2 className="w-3 h-3" />
                  <span className="truncate max-w-[200px]">{log.click_url}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error banner */}
        {log.error && (
          <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-red-700">Delivery Error</p>
                <p className="text-xs text-red-600 mt-0.5 break-all">{log.error}</p>
                {log.bounce_reason && log.bounce_reason !== log.error && (
                  <p className="text-xs text-red-500 mt-1 break-all">Bounce reason: {log.bounce_reason}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-auto min-h-0">
          {!hasBody ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <Mail className="w-8 h-8 text-gray-300" />
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-1">No Email Content Stored</h4>
              <p className="text-sm text-gray-500 max-w-md">
                The HTML content for this email was not captured. Email body logging may need to be enabled in the
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs mx-1">send-tracking-email</code>
                edge function.
              </p>
            </div>
          ) : viewMode === 'preview' ? (
            <iframe
              ref={iframeRef}
              title="Email Preview"
              className="w-full h-full min-h-[400px] border-0"
              sandbox="allow-same-origin"
            />
          ) : (
            <div className="p-4">
              <pre className="bg-gray-900 text-green-400 rounded-xl p-4 text-xs font-mono overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">
                {log.email_body}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        {hasBody && (
          <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <p className="text-[10px] text-gray-400">
              Content size: {(log.email_body!.length / 1024).toFixed(1)} KB
            </p>
            <button
              onClick={() => {
                const blob = new Blob([log.email_body!], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `email-${log.id.slice(0, 8)}.html`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Download HTML
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Delivery Status Badge ──────────────────────────────────────────────────
const DeliveryStatusBadge: React.FC<{ status: string | null; log: EmailLog }> = ({ status, log }) => {
  if (!status) {
    // If no delivery_status but email was sent, show as "Sent (Awaiting)"
    if (log.status === 'sent') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-gray-50 text-gray-500 border border-gray-200">
          <Clock className="w-2.5 h-2.5" />
          Awaiting
        </span>
      );
    }
    return null;
  }

  const config = DELIVERY_STATUS_CONFIG[status];
  if (!config) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-gray-50 text-gray-600 border border-gray-200">
        {status}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md border ${config.bg} ${config.color} ${config.border}`}>
      {config.icon}
      {config.label}
    </span>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────
const AdminEmailLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [cronLogs, setCronLogs] = useState<CronLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggerEmailCronLoading, setTriggerEmailCronLoading] = useState(false);
  const [triggerSearchCronLoading, setTriggerSearchCronLoading] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState(30);
  const [page, setPage] = useState(0);
  const [showCronLogs, setShowCronLogs] = useState(false);
  const [showWebhookSetup, setShowWebhookSetup] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [viewingEmail, setViewingEmail] = useState<EmailLog | null>(null);
  const [cronResults, setCronResults] = useState<{ type: string; data: any; timestamp: string } | null>(null);
  const pageSize = 25;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (searchEmail.trim()) {
        query = query.ilike('recipient', `%${searchEmail.trim()}%`);
      }
      if (eventFilter !== 'all') {
        query = query.eq('event_type', eventFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (deliveryStatusFilter !== 'all') {
        if (deliveryStatusFilter === 'awaiting') {
          query = query.is('delivery_status', null).eq('status', 'sent');
        } else {
          query = query.eq('delivery_status', deliveryStatusFilter);
        }
      }

      const cutoffDate = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', cutoffDate);

      const { data: logsData, error: logsError } = await query;
      if (logsError) throw logsError;
      setLogs(logsData || []);

      try {
        const { data: statsData, error: statsError } = await supabase.rpc('get_email_stats', { p_days: dateRange });
        if (!statsError && statsData) {
          setStats(typeof statsData === 'string' ? JSON.parse(statsData) : statsData);
        }
      } catch (e) {
        console.warn('Failed to load email stats:', e);
      }

      try {
        const { data: cronData } = await supabase
          .from('cron_job_log')
          .select('*')
          .in('job_name', ['email-trigger-cron', 'saved-search-cron'])
          .order('created_at', { ascending: false })
          .limit(20);
        setCronLogs(cronData || []);
      } catch (e) {
        console.warn('Failed to load cron logs:', e);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to load email logs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [searchEmail, eventFilter, statusFilter, deliveryStatusFilter, dateRange, page]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Cron Triggers ──────────────────────────────────────────────────────
  const handleTriggerEmailCron = async () => {
    setTriggerEmailCronLoading(true);
    setCronResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('email-trigger-cron', { body: {} });
      if (error) throw error;
      setCronResults({ type: 'email-trigger-cron', data, timestamp: new Date().toISOString() });
      toast({
        title: 'Email Cron Triggered',
        description: `Dispatched ${data?.dispatched || 0} emails. ${data?.errors?.length || 0} errors.`,
      });
      setTimeout(loadData, 1500);
    } catch (err: any) {
      setCronResults({ type: 'email-trigger-cron', data: { error: err.message }, timestamp: new Date().toISOString() });
      toast({ title: 'Email Cron Failed', description: err.message, variant: 'destructive' });
    } finally {
      setTriggerEmailCronLoading(false);
    }
  };

  const handleTriggerSearchCron = async () => {
    setTriggerSearchCronLoading(true);
    setCronResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('saved-search-cron', { body: {} });
      if (error) throw error;
      setCronResults({ type: 'saved-search-cron', data, timestamp: new Date().toISOString() });
      toast({
        title: 'Saved Search Cron Triggered',
        description: `Processed ${data?.searches_processed || 0} searches. ${data?.emails_sent || 0} alerts sent.`,
      });
      setTimeout(loadData, 1500);
    } catch (err: any) {
      setCronResults({ type: 'saved-search-cron', data: { error: err.message }, timestamp: new Date().toISOString() });
      toast({ title: 'Search Cron Failed', description: err.message, variant: 'destructive' });
    } finally {
      setTriggerSearchCronLoading(false);
    }
  };

  // ─── Resend Handler ─────────────────────────────────────────────────────
  const handleResend = async (log: EmailLog) => {
    setResendingId(log.id);
    try {
      await resendEmail(log.id);
      toast({
        title: 'Email Resent',
        description: `Successfully re-queued email to ${log.recipient}`,
      });
      setTimeout(loadData, 1500);
    } catch (err: any) {
      toast({
        title: 'Resend Failed',
        description: err.message || 'Could not resend email',
        variant: 'destructive',
      });
    } finally {
      setResendingId(null);
    }
  };

  // ─── Computed Values ────────────────────────────────────────────────────
  const deliveryRate = stats ? (stats.total_sent > 0 ? Math.round((stats.delivered / stats.total_sent) * 100) : 0) : 0;
  const failRate = stats ? (stats.total_sent > 0 ? Math.round((stats.failed / stats.total_sent) * 100) : 0) : 0;

  const chartData = useMemo(() => {
    if (!stats?.daily_volume) return [];
    const sorted = [...stats.daily_volume].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const maxCount = Math.max(...sorted.map(d => d.count), 1);
    return sorted.map(d => ({
      ...d,
      heightPercent: Math.round((d.count / maxCount) * 100),
      sentPercent: d.count > 0 ? Math.round((d.sent / d.count) * 100) : 0,
      failedPercent: d.count > 0 ? Math.round((d.failed / d.count) * 100) : 0,
    }));
  }, [stats]);

  const failedCount = logs.filter(l => l.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* ─── Stats Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {/* Total Sent */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center mb-2">
            <Send className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Total Sent</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">{stats?.total_sent?.toLocaleString() || '0'}</p>
        </div>

        {/* Delivered (our status) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Delivered</p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-xl font-bold text-gray-900 mt-0.5">{stats?.sg_delivered?.toLocaleString() || stats?.delivered?.toLocaleString() || '0'}</p>
            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
              <ArrowUpRight className="w-2.5 h-2.5" />{deliveryRate}%
            </span>
          </div>
        </div>

        {/* Open Rate */}
        <div className="bg-white rounded-2xl border border-blue-200 p-4 hover:shadow-md transition-shadow bg-gradient-to-br from-white to-blue-50/30">
          <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center mb-2">
            <MailOpen className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-[10px] font-medium text-blue-600 uppercase tracking-wider">Open Rate</p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-xl font-bold text-gray-900 mt-0.5">{stats?.open_rate || 0}%</p>
            <span className="text-[10px] text-gray-500">{stats?.opened?.toLocaleString() || '0'} opens</span>
          </div>
        </div>

        {/* Click Rate */}
        <div className="bg-white rounded-2xl border border-violet-200 p-4 hover:shadow-md transition-shadow bg-gradient-to-br from-white to-violet-50/30">
          <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center mb-2">
            <MousePointerClick className="w-4 h-4 text-violet-600" />
          </div>
          <p className="text-[10px] font-medium text-violet-600 uppercase tracking-wider">Click Rate</p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-xl font-bold text-gray-900 mt-0.5">{stats?.click_rate || 0}%</p>
            <span className="text-[10px] text-gray-500">{stats?.clicked?.toLocaleString() || '0'} clicks</span>
          </div>
        </div>

        {/* Bounced */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center mb-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Bounced</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">{stats?.bounced?.toLocaleString() || '0'}</p>
        </div>

        {/* Deferred */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center mb-2">
            <Timer className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Deferred</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">{stats?.deferred?.toLocaleString() || '0'}</p>
        </div>

        {/* Failed */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center mb-2">
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Failed</p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-xl font-bold text-gray-900 mt-0.5">{stats?.failed?.toLocaleString() || '0'}</p>
            <span className="text-[10px] font-bold text-red-600 flex items-center gap-0.5">
              <ArrowDownRight className="w-2.5 h-2.5" />{failRate}%
            </span>
          </div>
        </div>

        {/* Dispatch Queue */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center mb-2">
            <Activity className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Queue</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">{stats?.dispatch_stats?.pending?.toLocaleString() || '0'}</p>
          <p className="text-[9px] text-gray-400 mt-0.5">{stats?.dispatch_stats?.dispatched?.toLocaleString() || '0'} dispatched</p>
        </div>
      </div>

      {/* ─── Delivery Status Breakdown ───────────────────────────────────── */}
      {stats?.by_delivery_status && Object.keys(stats.by_delivery_status).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4 text-sm">
            <Globe className="w-4 h-4 text-blue-600" />
            Delivery Status Breakdown
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.by_delivery_status).map(([status, count]) => {
              const config = DELIVERY_STATUS_CONFIG[status] || { label: status, color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', icon: <Mail className="w-3 h-3" /> };
              const isActive = deliveryStatusFilter === status;
              return (
                <button
                  key={status}
                  onClick={() => { setDeliveryStatusFilter(isActive ? 'all' : status); setPage(0); }}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all cursor-pointer ${config.bg} ${config.border} ${
                    isActive ? 'ring-2 ring-blue-500 ring-offset-1 shadow-md' : 'hover:shadow-sm'
                  }`}
                >
                  {config.icon}
                  <span className={`font-semibold ${config.color}`}>{config.label}</span>
                  <span className="text-xs font-bold text-gray-900 bg-white/80 px-1.5 py-0.5 rounded-md">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Email Volume Chart ──────────────────────────────────────────── */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              Email Volume ({dateRange} days)
            </h3>
            <div className="flex items-center gap-2">
              <select
                value={dateRange}
                onChange={(e) => { setDateRange(Number(e.target.value)); setPage(0); }}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-0 top-0 bottom-6 w-8 flex flex-col justify-between text-[9px] text-gray-400 font-mono">
              <span>{Math.max(...chartData.map(d => d.count))}</span>
              <span>{Math.round(Math.max(...chartData.map(d => d.count)) / 2)}</span>
              <span>0</span>
            </div>

            <div className="ml-10 flex items-end gap-[2px] h-40">
              {chartData.map((d, i) => {
                const barHeight = Math.max(d.heightPercent, 3);
                const failedHeight = d.count > 0 ? Math.round((d.failed / d.count) * barHeight) : 0;
                const bouncedHeight = d.count > 0 ? Math.round(((d as any).bounced || 0) / d.count * barHeight) : 0;
                const sentHeight = barHeight - failedHeight - bouncedHeight;

                return (
                  <div key={i} className="flex-1 flex flex-col items-center group relative cursor-pointer">
                    <div className="w-full flex flex-col justify-end" style={{ height: '160px' }}>
                      <div
                        className="w-full rounded-t-sm bg-blue-500 group-hover:bg-blue-600 transition-colors"
                        style={{ height: `${sentHeight}%`, minHeight: d.count > 0 ? '2px' : '0' }}
                      />
                      {bouncedHeight > 0 && (
                        <div
                          className="w-full bg-amber-400 group-hover:bg-amber-500 transition-colors"
                          style={{ height: `${bouncedHeight}%`, minHeight: '1px' }}
                        />
                      )}
                      {failedHeight > 0 && (
                        <div
                          className="w-full bg-red-400 group-hover:bg-red-500 transition-colors"
                          style={{ height: `${failedHeight}%`, minHeight: '1px' }}
                        />
                      )}
                    </div>

                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-20 pointer-events-none">
                      <div className="bg-gray-900 text-white text-[10px] rounded-xl px-3 py-2 whitespace-nowrap shadow-xl">
                        <p className="font-bold text-xs mb-1">
                          {new Date(d.date).toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <div className="space-y-0.5">
                          <p className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm bg-blue-400" />
                            {d.sent} sent
                          </p>
                          <p className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm bg-red-400" />
                            {d.failed} failed
                          </p>
                          {(d as any).opened > 0 && (
                            <p className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-sm bg-sky-400" />
                              {(d as any).opened} opened
                            </p>
                          )}
                          {(d as any).clicked > 0 && (
                            <p className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-sm bg-violet-400" />
                              {(d as any).clicked} clicked
                            </p>
                          )}
                          <p className="text-gray-400 border-t border-gray-700 pt-1 mt-1">
                            {d.count} total
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="ml-10 flex items-center justify-between mt-2 text-[9px] text-gray-400 font-mono">
              <span>
                {chartData[0]?.date
                  ? new Date(chartData[0].date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })
                  : ''}
              </span>
              {chartData.length > 4 && (
                <span>
                  {new Date(chartData[Math.floor(chartData.length / 2)].date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}
                </span>
              )}
              <span>
                {chartData[chartData.length - 1]?.date
                  ? new Date(chartData[chartData.length - 1].date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })
                  : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-gray-100">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded-sm bg-blue-500" /> Sent
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded-sm bg-red-400" /> Failed
            </span>
            <span className="text-xs text-gray-400">
              Avg: {chartData.length > 0 ? Math.round(chartData.reduce((s, d) => s + d.count, 0) / chartData.length) : 0}/day
            </span>
          </div>
        </div>
      )}

      {/* ─── Event Type Breakdown ────────────────────────────────────────── */}
      {stats?.by_event_type && Object.keys(stats.by_event_type).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4 text-sm">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            By Event Type
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(stats.by_event_type).map(([type, count]) => {
              const config = EVENT_TYPE_LABELS[type] || { label: type, color: 'text-gray-700', bg: 'bg-gray-100', icon: <Mail className="w-3 h-3" /> };
              return (
                <button
                  key={type}
                  onClick={() => { setEventFilter(type); setPage(0); }}
                  className={`${config.bg} rounded-xl p-3 border text-left hover:shadow-md transition-all cursor-pointer ${
                    eventFilter === type ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={config.color}>{config.icon}</span>
                    <p className={`text-[10px] font-semibold ${config.color} uppercase tracking-wider`}>{config.label}</p>
                  </div>
                  <p className="text-xl font-bold text-gray-900 mt-1">{count}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Cron Triggers + Actions ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleTriggerEmailCron}
              disabled={triggerEmailCronLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-200 disabled:opacity-50"
            >
              {triggerEmailCronLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run Email Cron
            </button>
            <button
              onClick={handleTriggerSearchCron}
              disabled={triggerSearchCronLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 text-white font-semibold rounded-xl hover:bg-cyan-700 transition-all text-sm shadow-lg shadow-cyan-200 disabled:opacity-50"
            >
              {triggerSearchCronLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bookmark className="w-4 h-4" />}
              Run Saved Search Cron
            </button>
            <button
              onClick={() => setShowCronLogs(!showCronLogs)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              <Activity className="w-4 h-4" />
              Cron History
              {showCronLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              onClick={() => setShowWebhookSetup(!showWebhookSetup)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border rounded-xl hover:bg-gray-50 ${
                showWebhookSetup ? 'text-blue-700 border-blue-300 bg-blue-50' : 'text-gray-700 border-gray-200'
              }`}
            >
              <Globe className="w-4 h-4" />
              Webhook
              {showWebhookSetup ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2.5 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {failedCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
              <XCircle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-semibold text-red-700">{failedCount} failed on this page</span>
            </div>
          )}
        </div>

        {/* Live Cron Results */}
        {cronResults && (
          <div className={`mt-4 p-4 rounded-xl border ${
            cronResults.data?.error
              ? 'bg-red-50 border-red-200'
              : 'bg-emerald-50 border-emerald-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {cronResults.data?.error ? (
                  <XCircle className="w-4 h-4 text-red-600" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                )}
                <span className="text-sm font-bold text-gray-900">
                  {cronResults.type === 'email-trigger-cron' ? 'Email Cron' : 'Saved Search Cron'} Result
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">
                  {new Date(cronResults.timestamp).toLocaleTimeString('en-ZA')}
                </span>
                <button
                  onClick={() => setCronResults(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            <pre className="text-xs font-mono bg-white/60 rounded-lg p-3 overflow-auto max-h-40 text-gray-700">
              {JSON.stringify(cronResults.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* ─── Webhook Setup ────────────────────────────────────────────────── */}
      {showWebhookSetup && (
        <div className="bg-gradient-to-br from-blue-50 to-violet-50 rounded-2xl border border-blue-200 p-6">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-blue-600" />
            SendGrid Event Webhook Setup
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Enable real-time delivery tracking by configuring SendGrid's Event Webhook to send events to your edge function.
            This provides granular delivery statuses: <strong>delivered</strong>, <strong>opened</strong>, <strong>clicked</strong>, <strong>bounced</strong>, <strong>deferred</strong>, and <strong>dropped</strong>.
          </p>
          <div className="space-y-3">
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="text-xs font-bold text-gray-700 mb-2">Step 1: Webhook URL</p>
              <p className="text-xs text-gray-500 mb-2">
                In SendGrid Dashboard &gt; Settings &gt; Mail Settings &gt; Event Webhook, set the HTTP POST URL to:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] bg-gray-900 text-green-400 rounded-lg p-3 font-mono overflow-x-auto">
                  {`https://<your-project-ref>.supabase.co/functions/v1/sendgrid-webhook`}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText('https://<your-project-ref>.supabase.co/functions/v1/sendgrid-webhook');
                    toast({ title: 'Copied', description: 'Webhook URL copied to clipboard' });
                  }}
                  className="px-3 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex-shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="text-xs font-bold text-gray-700 mb-2">Step 2: Select Events</p>
              <p className="text-xs text-gray-500 mb-2">Enable these events in the webhook configuration:</p>
              <div className="flex flex-wrap gap-1.5">
                {['Processed', 'Delivered', 'Opened', 'Clicked', 'Bounced', 'Dropped', 'Deferred', 'Spam Report', 'Unsubscribe'].map(evt => (
                  <span key={evt} className="px-2 py-1 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded-md">{evt}</span>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="text-xs font-bold text-gray-700 mb-2">Step 3: Signature Verification (Optional)</p>
              <p className="text-xs text-gray-500">
                For production security, enable <strong>Signed Event Webhook</strong> in SendGrid, copy the Verification Key,
                and add it as a Supabase secret named <code className="bg-gray-100 px-1 rounded">SENDGRID_WEBHOOK_VERIFICATION_KEY</code>.
                The webhook works without verification but is less secure.
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-emerald-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <p className="text-xs font-bold text-emerald-700">Current Status</p>
              </div>
              <p className="text-xs text-gray-600">
                The <code className="bg-gray-100 px-1 rounded">sendgrid-webhook</code> edge function is deployed and active.
                Signature verification is <strong>optional</strong> (currently {stats ? 'processing events' : 'awaiting first event'}).
                Supported events: processed, delivered, bounce, dropped, deferred, open, click, spamreport, unsubscribe.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Cron History ────────────────────────────────────────────────── */}
      {showCronLogs && (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent Cron Runs</h4>
          {cronLogs.length === 0 ? (
            <p className="text-xs text-gray-400">No cron runs recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {cronLogs.map(cl => (
                <div key={cl.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {cl.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    ) : cl.status === 'failed' ? (
                      <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          cl.job_name === 'saved-search-cron'
                            ? 'bg-cyan-100 text-cyan-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {cl.job_name === 'saved-search-cron' ? 'SEARCH' : 'EMAIL'}
                        </span>
                        <p className="text-xs font-medium text-gray-900">
                          {cl.status === 'completed'
                            ? cl.job_name === 'saved-search-cron'
                              ? `${cl.result?.emails_sent || 0} alerts sent, ${cl.result?.searches_processed || 0} searches`
                              : `Dispatched ${cl.result?.dispatched || 0} emails`
                            : cl.status}
                        </p>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(cl.started_at)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {cl.result?.duration_ms && (
                      <p className="text-[10px] text-gray-400">{cl.result.duration_ms}ms</p>
                    )}
                    {cl.error && (
                      <p className="text-[10px] text-red-500 max-w-[200px] truncate" title={cl.error}>{cl.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchEmail}
            onChange={(e) => { setSearchEmail(e.target.value); setPage(0); }}
            placeholder="Search by email address..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          />
        </div>
        <select
          value={eventFilter}
          onChange={(e) => { setEventFilter(e.target.value); setPage(0); }}
          className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="all">All Events</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
          <option value="pending">Pending</option>
        </select>
        <select
          value={deliveryStatusFilter}
          onChange={(e) => { setDeliveryStatusFilter(e.target.value); setPage(0); }}
          className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="all">All Delivery</option>
          <option value="awaiting">Awaiting</option>
          <option value="delivered">Delivered</option>
          <option value="opened">Opened</option>
          <option value="clicked">Clicked</option>
          <option value="bounced">Bounced</option>
          <option value="deferred">Deferred</option>
          <option value="dropped">Dropped</option>
        </select>
        {(eventFilter !== 'all' || statusFilter !== 'all' || deliveryStatusFilter !== 'all' || searchEmail.trim()) && (
          <button
            onClick={() => { setEventFilter('all'); setStatusFilter('all'); setDeliveryStatusFilter('all'); setSearchEmail(''); setPage(0); }}
            className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* ─── Email Logs Table ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Delivery</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Recipient</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Event Type</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Subject</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Order</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Provider</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Time</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map(log => {
                    const eventConfig = EVENT_TYPE_LABELS[log.event_type || ''] || {
                      label: log.event_type || 'Unknown',
                      color: 'text-gray-700',
                      bg: 'bg-gray-100',
                      icon: <Mail className="w-3 h-3" />,
                    };
                    const isFailed = log.status === 'failed';
                    const isResending = resendingId === log.id;

                    return (
                      <tr key={log.id} className={`hover:bg-gray-50 transition-colors ${isFailed ? 'bg-red-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {STATUS_ICONS[log.status] || STATUS_ICONS.pending}
                            <span className={`text-xs font-medium capitalize ${
                              log.status === 'sent' ? 'text-emerald-700' :
                              log.status === 'failed' ? 'text-red-700' :
                              log.status === 'skipped' ? 'text-amber-700' : 'text-gray-500'
                            }`}>
                              {log.status}
                            </span>
                          </div>
                          {log.error && (
                            <p className="text-[10px] text-red-500 mt-0.5 max-w-[120px] truncate" title={log.error}>
                              {log.error}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <DeliveryStatusBadge status={log.delivery_status} log={log} />
                          {/* Show engagement indicators */}
                          {(log.opened_at || log.clicked_at) && (
                            <div className="flex items-center gap-1 mt-1">
                              {log.opened_at && (
                                <span className="flex items-center gap-0.5 text-[9px] text-blue-600" title={`Opened ${new Date(log.opened_at).toLocaleString('en-ZA')}`}>
                                  <MailOpen className="w-2.5 h-2.5" />
                                </span>
                              )}
                              {log.clicked_at && (
                                <span className="flex items-center gap-0.5 text-[9px] text-violet-600" title={`Clicked ${new Date(log.clicked_at).toLocaleString('en-ZA')}`}>
                                  <MousePointerClick className="w-2.5 h-2.5" />
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-900 font-medium truncate max-w-[200px]">{log.recipient}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full ${eventConfig.bg} ${eventConfig.color}`}>
                            {eventConfig.icon}
                            {eventConfig.label}
                          </span>
                          {log.tracking_status && (
                            <p className="text-[10px] text-gray-400 mt-0.5">{log.tracking_status}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <p className="text-xs text-gray-600 truncate max-w-[250px]" title={log.subject}>
                            {log.subject}
                          </p>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {log.order_id ? (
                            <span className="text-xs font-mono text-blue-600">
                              #{log.order_id.slice(0, 8)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs text-gray-500 capitalize">{log.provider || '-'}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-xs text-gray-500">{timeAgo(log.created_at)}</p>
                          <p className="text-[10px] text-gray-400">
                            {new Date(log.created_at).toLocaleDateString('en-ZA')}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setViewingEmail(log)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                log.email_body
                                  ? 'text-blue-600 hover:bg-blue-50 hover:text-blue-700'
                                  : 'text-gray-300 hover:bg-gray-50 hover:text-gray-400'
                              }`}
                              title={log.email_body ? 'View email content' : 'No email content stored'}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {isFailed && (
                              <button
                                onClick={() => handleResend(log)}
                                disabled={isResending}
                                className="p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors disabled:opacity-50"
                                title="Retry sending this email"
                              >
                                {isResending ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {logs.length === 0 && (
              <div className="p-12 text-center">
                <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-900 mb-1">No email logs</h3>
                <p className="text-sm text-gray-500">No emails match your current filters.</p>
              </div>
            )}

            {/* Pagination */}
            {logs.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Showing {page * pageSize + 1}-{page * pageSize + logs.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-400">Page {page + 1}</span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={logs.length < pageSize}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Cron Setup Instructions ─────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl border border-blue-200 p-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-blue-600" />
          Automatic Scheduling Setup
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Two cron functions power automated emails: <strong>email-trigger-cron</strong> processes queued transactional emails,
          and <strong>saved-search-cron</strong> checks for new listings matching saved searches.
        </p>
        <div className="space-y-3">
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs font-bold text-gray-700 mb-2">Option 1: pg_cron (Recommended)</p>
            <p className="text-xs text-gray-500 mb-2">Enable pg_cron via Supabase Dashboard &gt; Database &gt; Extensions, then run:</p>
            <code className="block text-[11px] bg-gray-900 text-green-400 rounded-lg p-3 font-mono overflow-x-auto whitespace-pre">
{`-- Email trigger cron (every minute)
SELECT cron.schedule('email-trigger-cron', '* * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/email-trigger-cron',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.supabase_anon_key'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  )$$
);

-- Saved search cron (every 15 minutes)
SELECT cron.schedule('saved-search-cron', '*/15 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/saved-search-cron',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.supabase_anon_key'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  )$$
);`}
            </code>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs font-bold text-gray-700 mb-2">Option 2: External Cron (cron-job.org)</p>
            <p className="text-xs text-gray-500">
              Set up free cron jobs at cron-job.org to POST to your edge function URLs.
              Use every 60 seconds for email-trigger-cron and every 15 minutes for saved-search-cron.
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs font-bold text-gray-700 mb-2">Current Status: Database Triggers Active</p>
            <p className="text-xs text-gray-500">
              Transactional emails are automatically queued via database triggers on{' '}
              <code className="bg-gray-100 px-1 rounded">order_tracking</code> INSERT and{' '}
              <code className="bg-gray-100 px-1 rounded">orders</code> status changes.
              Saved search alerts are processed by the saved-search-cron function.
              Use the buttons above to process queues manually, or set up automatic scheduling.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Email Content Modal ─────────────────────────────────────────── */}
      {viewingEmail && (
        <EmailContentModal
          log={viewingEmail}
          onClose={() => setViewingEmail(null)}
        />
      )}
    </div>
  );
};

export default AdminEmailLogsTab;
