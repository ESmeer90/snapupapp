import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDisputes, respondToDispute, formatZAR, timeAgo } from '@/lib/api';
import type { Dispute } from '@/types';
import { DISPUTE_REASON_LABELS, DISPUTE_STATUS_CONFIG, type DisputeStatus, type DisputeReason } from '@/types';
import {
  AlertTriangle, Eye, CheckCircle2, XCircle, DollarSign, Lock,
  Loader2, RefreshCw, MessageSquare, Shield, ChevronDown, ChevronUp,
  Image as ImageIcon, Send
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  AlertTriangle: <AlertTriangle className="w-3.5 h-3.5" />,
  Eye: <Eye className="w-3.5 h-3.5" />,
  CheckCircle2: <CheckCircle2 className="w-3.5 h-3.5" />,
  XCircle: <XCircle className="w-3.5 h-3.5" />,
  DollarSign: <DollarSign className="w-3.5 h-3.5" />,
  Lock: <Lock className="w-3.5 h-3.5" />,
};

interface DisputesListProps {
  role: 'buyer' | 'seller';
}

const DisputesList: React.FC<DisputesListProps> = ({ role }) => {
  const { user } = useAuth();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadDisputes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getDisputes(role);
      setDisputes(data);
    } catch (err: any) {
      console.error('Failed to load disputes:', err);
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => { loadDisputes(); }, [loadDisputes]);

  const handleRespond = async (disputeId: string, acceptRefund: boolean) => {
    if (!responseText.trim() && !acceptRefund) {
      toast({ title: 'Response required', description: 'Please provide a response.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const confirmMsg = acceptRefund
        ? 'Are you sure you want to accept the refund? The order will be marked as refunded.'
        : 'Submit your response to this dispute?';
      if (!confirm(confirmMsg)) { setSubmitting(false); return; }

      await respondToDispute(disputeId, responseText.trim(), acceptRefund);
      toast({ title: acceptRefund ? 'Refund accepted' : 'Response sent', description: acceptRefund ? 'The order has been refunded.' : 'Your response has been submitted.' });
      setRespondingId(null);
      setResponseText('');
      loadDisputes();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to respond.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (disputes.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
        <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-900 mb-1">No disputes</h3>
        <p className="text-sm text-gray-500">
          {role === 'buyer' ? 'You have no open disputes.' : 'No disputes have been raised on your orders.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          {disputes.length} Dispute{disputes.length !== 1 ? 's' : ''}
        </h3>
        <button onClick={loadDisputes} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg transition-all">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {disputes.map((dispute) => {
        const statusConfig = DISPUTE_STATUS_CONFIG[dispute.status as DisputeStatus];
        const isExpanded = expandedId === dispute.id;
        const isResponding = respondingId === dispute.id;
        const canRespond = role === 'seller' && ['open'].includes(dispute.status);

        return (
          <div
            key={dispute.id}
            className={`bg-white rounded-2xl border transition-all ${
              isExpanded ? 'border-red-200 shadow-lg shadow-red-50' : 'border-gray-200 hover:shadow-md'
            }`}
          >
            <div
              className="flex items-start gap-3 p-4 cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : dispute.id)}
            >
              {dispute.order_listing_image && (
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  <img src={dispute.order_listing_image} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {dispute.order_listing_title || 'Order'}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig?.bg} ${statusConfig?.color}`}>
                        {STATUS_ICONS[statusConfig?.icon || 'AlertTriangle']}
                        {statusConfig?.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {DISPUTE_REASON_LABELS[dispute.reason as DisputeReason]}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400">{timeAgo(dispute.created_at)}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-gray-100 p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm text-gray-700">{dispute.description}</p>
                </div>

                {dispute.evidence_urls && dispute.evidence_urls.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" /> Evidence Photos
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {dispute.evidence_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-all">
                          <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {dispute.order_amount && (
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500">Order Amount: <span className="font-bold text-gray-900">{formatZAR(dispute.order_amount)}</span></span>
                    {dispute.resolution_amount && (
                      <span className="text-emerald-600">Refund: <span className="font-bold">{formatZAR(dispute.resolution_amount)}</span></span>
                    )}
                  </div>
                )}

                {dispute.resolution && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Resolution</p>
                    <p className="text-sm text-gray-700">{dispute.resolution}</p>
                  </div>
                )}

                {/* Seller Response Form */}
                {canRespond && (
                  <div className="border-t border-gray-100 pt-3">
                    {isResponding ? (
                      <div className="space-y-3">
                        <textarea
                          value={responseText}
                          onChange={e => setResponseText(e.target.value)}
                          placeholder="Your response to this dispute..."
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleRespond(dispute.id, false)}
                            disabled={submitting}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all disabled:opacity-50"
                          >
                            {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            Send Response
                          </button>
                          <button
                            onClick={() => handleRespond(dispute.id, true)}
                            disabled={submitting}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-all disabled:opacity-50"
                          >
                            {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                            Accept Refund
                          </button>
                          <button
                            onClick={() => { setRespondingId(null); setResponseText(''); }}
                            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRespondingId(dispute.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
                      >
                        <MessageSquare className="w-3 h-3" />
                        Respond to Dispute
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                  <Shield className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-700">
                    Dispute data processed per POPIA. Only necessary information is shared between parties.
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DisputesList;
