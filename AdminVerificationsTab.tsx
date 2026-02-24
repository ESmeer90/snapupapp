import React, { useState, useEffect, useCallback } from 'react';
import {
  BadgeCheck, Loader2, Search, Eye, CheckCircle2, XCircle, ChevronDown,
  ChevronUp, User, MapPin, Calendar, FileText, Shield, AlertTriangle, Clock
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getAdminVerifications, adminReviewVerification, timeAgo } from '@/lib/api';

interface Verification {
  id: string;
  user_id: string;
  full_legal_name: string;
  id_number: string;
  id_type: string;
  document_url: string;
  document_back_url: string;
  selfie_url: string;
  status: string;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  user_name: string;
  user_email: string;
  user_avatar: string;
  user_province: string;
  user_joined: string;
}

function maskIdNumber(id: string): string {
  if (!id || id.length < 6) return '****';
  return id.substring(0, 4) + '****' + id.substring(id.length - 2);
}

const AdminVerificationsTab: React.FC = () => {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; label: string } | null>(null);

  const loadVerifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminVerifications(statusFilter);
      setVerifications(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to load verifications', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadVerifications(); }, [loadVerifications]);

  const handleApprove = async (v: Verification) => {
    setProcessingId(v.id);
    try {
      await adminReviewVerification(v.id, v.user_id, true, 'Approved by admin');
      toast({ title: 'Seller Verified', description: `${v.user_name} is now a verified seller.` });
      setVerifications(prev => prev.map(item =>
        item.id === v.id ? { ...item, status: 'approved', reviewed_at: new Date().toISOString() } : item
      ));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (v: Verification) => {
    const notes = rejectNotes[v.id];
    if (!notes?.trim()) {
      toast({ title: 'Notes required', description: 'Please provide a reason for rejection.', variant: 'destructive' });
      return;
    }
    setProcessingId(v.id);
    try {
      await adminReviewVerification(v.id, v.user_id, false, notes.trim());
      toast({ title: 'Verification Rejected', description: `${v.user_name}'s verification has been rejected.` });
      setVerifications(prev => prev.map(item =>
        item.id === v.id ? { ...item, status: 'rejected', admin_notes: notes.trim(), reviewed_at: new Date().toISOString() } : item
      ));
      setShowRejectForm(null);
      setRejectNotes(prev => ({ ...prev, [v.id]: '' }));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const pendingCount = verifications.filter(v => v.status === 'pending').length;
  const approvedCount = verifications.filter(v => v.status === 'approved').length;
  const rejectedCount = verifications.filter(v => v.status === 'rejected').length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center mb-2">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pending</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center mb-2">
            <BadgeCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Approved</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{approvedCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center mb-2">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Rejected</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{rejectedCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { value: 'all', label: 'All', count: verifications.length },
          { value: 'pending', label: 'Pending', count: pendingCount },
          { value: 'approved', label: 'Approved', count: approvedCount },
          { value: 'rejected', label: 'Rejected', count: rejectedCount },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              statusFilter === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && verifications.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <BadgeCheck className="w-14 h-14 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No verifications</h3>
          <p className="text-sm text-gray-500">No seller verification requests found.</p>
        </div>
      )}

      {/* Verification cards */}
      {!loading && verifications.length > 0 && (
        <div className="space-y-4">
          {verifications.map(v => {
            const isExpanded = expandedId === v.id;
            const isPending = v.status === 'pending';
            const statusColors = {
              pending: 'bg-amber-100 text-amber-700 border-amber-200',
              approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
              rejected: 'bg-red-100 text-red-700 border-red-200',
            };

            return (
              <div key={v.id} className={`bg-white rounded-2xl border ${isPending ? 'border-amber-200 shadow-sm' : 'border-gray-200'} overflow-hidden`}>
                {/* Header */}
                <div
                  className="p-5 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : v.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {v.user_avatar ? (
                        <img src={v.user_avatar} alt="" className="w-12 h-12 rounded-xl object-cover border border-gray-200" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                          <User className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-gray-900">{v.user_name}</h4>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase border ${statusColors[v.status as keyof typeof statusColors] || statusColors.pending}`}>
                            {v.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{v.user_email}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{v.user_province}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Joined {v.user_joined ? timeAgo(v.user_joined) : 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Submitted {timeAgo(v.created_at)}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-5 space-y-5">
                    {/* Verification info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Full Legal Name</p>
                        <p className="text-sm font-bold text-gray-900">{v.full_legal_name || 'Not provided'}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">ID Number (Masked)</p>
                        <p className="text-sm font-bold text-gray-900 font-mono">{maskIdNumber(v.id_number)}</p>
                        <p className="text-[10px] text-gray-400 mt-1">Type: {v.id_type || 'SA ID'}</p>
                      </div>
                    </div>

                    {/* Document previews */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Identity Documents</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Front */}
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                            <p className="text-[10px] font-semibold text-gray-600">ID Front</p>
                          </div>
                          {v.document_url ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setImagePreview({ url: v.document_url, label: 'ID Document - Front' }); }}
                              className="w-full aspect-[3/2] bg-gray-100 hover:opacity-80 transition-opacity relative group"
                            >
                              <img src={v.document_url} alt="ID Front" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </button>
                          ) : (
                            <div className="aspect-[3/2] bg-gray-50 flex items-center justify-center">
                              <p className="text-xs text-gray-400">Not uploaded</p>
                            </div>
                          )}
                        </div>

                        {/* Back */}
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                            <p className="text-[10px] font-semibold text-gray-600">ID Back</p>
                          </div>
                          {v.document_back_url ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setImagePreview({ url: v.document_back_url, label: 'ID Document - Back' }); }}
                              className="w-full aspect-[3/2] bg-gray-100 hover:opacity-80 transition-opacity relative group"
                            >
                              <img src={v.document_back_url} alt="ID Back" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </button>
                          ) : (
                            <div className="aspect-[3/2] bg-gray-50 flex items-center justify-center">
                              <p className="text-xs text-gray-400">Not uploaded</p>
                            </div>
                          )}
                        </div>

                        {/* Selfie */}
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                            <p className="text-[10px] font-semibold text-gray-600">Selfie</p>
                          </div>
                          {v.selfie_url ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setImagePreview({ url: v.selfie_url, label: 'Selfie Verification' }); }}
                              className="w-full aspect-[3/2] bg-gray-100 hover:opacity-80 transition-opacity relative group"
                            >
                              <img src={v.selfie_url} alt="Selfie" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </button>
                          ) : (
                            <div className="aspect-[3/2] bg-gray-50 flex items-center justify-center">
                              <p className="text-xs text-gray-400">Not uploaded</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Admin notes (if rejected) */}
                    {v.admin_notes && (
                      <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                        <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-1">Admin Notes</p>
                        <p className="text-sm text-red-800">{v.admin_notes}</p>
                        {v.reviewed_at && <p className="text-[10px] text-red-500 mt-2">Reviewed {timeAgo(v.reviewed_at)}</p>}
                      </div>
                    )}

                    {/* Actions */}
                    {isPending && (
                      <div className="border-t border-gray-100 pt-4">
                        {showRejectForm === v.id ? (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Rejection Reason *</label>
                              <textarea
                                value={rejectNotes[v.id] || ''}
                                onChange={(e) => setRejectNotes(prev => ({ ...prev, [v.id]: e.target.value }))}
                                rows={3}
                                placeholder="Provide a reason for rejection (e.g., blurry document, name mismatch, expired ID)..."
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-red-500 outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setShowRejectForm(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleReject(v)}
                                disabled={processingId === v.id || !rejectNotes[v.id]?.trim()}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-all"
                              >
                                {processingId === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                Confirm Rejection
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApprove(v)}
                              disabled={processingId === v.id}
                              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50 transition-all shadow-lg shadow-emerald-200"
                            >
                              {processingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                              Approve & Verify
                            </button>
                            <button
                              onClick={() => setShowRejectForm(v.id)}
                              disabled={processingId === v.id}
                              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl disabled:opacity-50 transition-all"
                            >
                              <XCircle className="w-4 h-4" />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Image Preview Modal */}
      {imagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setImagePreview(null)}
        >
          <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-semibold">{imagePreview.label}</p>
              <button onClick={() => setImagePreview(null)} className="text-white/70 hover:text-white">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <img
              src={imagePreview.url}
              alt={imagePreview.label}
              className="w-full rounded-xl shadow-2xl max-h-[80vh] object-contain bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminVerificationsTab;
