import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getSellerRatings, getSellerRatingSummary, formatZAR, timeAgo } from '@/lib/api';
import type { SellerRating } from '@/types';
import {
  Star, ArrowLeft, Loader2, Filter, SortAsc, SortDesc, ChevronLeft, ChevronRight,
  Flag, X, AlertTriangle, MessageSquare, User, BarChart3, CheckCircle2, Search
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface SellerReviewsViewProps {
  sellerId: string;
  sellerName: string;
  onBack: () => void;
}

const REVIEWS_PER_PAGE = 10;

const SellerReviewsView: React.FC<SellerReviewsViewProps> = ({ sellerId, sellerName, onBack }) => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<SellerRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{ average: number; total: number; distribution: Record<string, number> } | null>(null);

  // Filters
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Report modal
  const [reportModal, setReportModal] = useState<{ open: boolean; reviewId: string | null }>({ open: false, reviewId: null });
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reviewsData, summaryData] = await Promise.all([
        getSellerRatings(sellerId),
        getSellerRatingSummary(sellerId),
      ]);
      setReviews(reviewsData);
      setSummary(summaryData);

      // Check which reviews user has already reported
      if (user) {
        const { data: reports } = await supabase
          .from('review_reports')
          .select('review_id')
          .eq('reporter_id', user.id);
        if (reports) {
          setReportedIds(new Set(reports.map((r: any) => r.review_id)));
        }
      }
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to load reviews', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [sellerId, user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter and sort reviews
  const filteredReviews = reviews
    .filter(r => {
      if (starFilter && r.rating !== starFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesReview = r.review?.toLowerCase().includes(q);
        const matchesBuyer = r.buyer_name_masked?.toLowerCase().includes(q);
        if (!matchesReview && !matchesBuyer) return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'highest': return b.rating - a.rating;
        case 'lowest': return a.rating - b.rating;
        default: return 0;
      }
    });

  const totalPages = Math.ceil(filteredReviews.length / REVIEWS_PER_PAGE);
  const paginatedReviews = filteredReviews.slice(
    (currentPage - 1) * REVIEWS_PER_PAGE,
    currentPage * REVIEWS_PER_PAGE
  );

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [starFilter, sortBy, searchQuery]);

  const handleReport = async () => {
    if (!user || !reportModal.reviewId || !reportReason) return;
    setSubmittingReport(true);
    try {
      const { error } = await supabase.from('review_reports').insert({
        review_id: reportModal.reviewId,
        reporter_id: user.id,
        reason: reportReason,
        description: reportDescription || null,
      });
      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Already reported', description: 'You have already reported this review.' });
        } else {
          throw error;
        }
      } else {
        setReportedIds(prev => new Set([...prev, reportModal.reviewId!]));
        toast({ title: 'Report submitted', description: 'Thank you. Our team will review this report.' });
      }
      setReportModal({ open: false, reviewId: null });
      setReportReason('');
      setReportDescription('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to submit report', variant: 'destructive' });
    } finally {
      setSubmittingReport(false);
    }
  };

  const dist = summary?.distribution || { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  const maxDistCount = Math.max(...Object.values(dist), 1);

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reviews for {sellerName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {summary ? `${summary.total} review${summary.total !== 1 ? 's' : ''} · ${summary.average.toFixed(1)} average` : 'Loading...'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary Card with Distribution Chart */}
          {summary && summary.total > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-6">
              <div className="flex flex-col sm:flex-row gap-6">
                {/* Average Score */}
                <div className="flex flex-col items-center justify-center sm:min-w-[140px]">
                  <div className="text-5xl font-black text-gray-900">{summary.average.toFixed(1)}</div>
                  <div className="flex items-center gap-0.5 mt-2">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`w-5 h-5 ${s <= Math.round(summary.average) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{summary.total} review{summary.total !== 1 ? 's' : ''}</p>
                </div>

                {/* Distribution Bars */}
                <div className="flex-1 space-y-2">
                  {[5, 4, 3, 2, 1].map(star => {
                    const count = dist[String(star)] || 0;
                    const pct = summary.total > 0 ? (count / summary.total) * 100 : 0;
                    const barWidth = maxDistCount > 0 ? (count / maxDistCount) * 100 : 0;
                    return (
                      <button
                        key={star}
                        onClick={() => setStarFilter(starFilter === star ? null : star)}
                        className={`w-full flex items-center gap-3 group hover:bg-gray-50 rounded-lg px-2 py-1 transition-all ${starFilter === star ? 'bg-amber-50 ring-1 ring-amber-200' : ''}`}
                      >
                        <span className="flex items-center gap-1 w-12 flex-shrink-0 text-sm font-medium text-gray-600">
                          {star}
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        </span>
                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              star >= 4 ? 'bg-emerald-400' : star === 3 ? 'bg-amber-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Filters & Sort Bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search reviews..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Star Filter Pills */}
              <div className="flex items-center gap-1">
                <Filter className="w-4 h-4 text-gray-400 mr-1" />
                <button
                  onClick={() => setStarFilter(null)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${!starFilter ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                >
                  All
                </button>
                {[5, 4, 3, 2, 1].map(s => (
                  <button
                    key={s}
                    onClick={() => setStarFilter(starFilter === s ? null : s)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-0.5 ${
                      starFilter === s ? 'bg-amber-100 text-amber-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {s}<Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  </button>
                ))}
              </div>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="px-3 py-2 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg text-gray-600 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="highest">Highest Rated</option>
                <option value="lowest">Lowest Rated</option>
              </select>
            </div>

            {/* Active filter indicator */}
            {(starFilter || searchQuery) && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-400">Showing {filteredReviews.length} of {reviews.length} reviews</span>
                <button
                  onClick={() => { setStarFilter(null); setSearchQuery(''); }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear filters
                </button>
              </div>
            )}
          </div>

          {/* Reviews List */}
          {paginatedReviews.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-700 mb-1">
                {reviews.length === 0 ? 'No reviews yet' : 'No matching reviews'}
              </h3>
              <p className="text-sm text-gray-500">
                {reviews.length === 0 ? 'This seller has not received any reviews.' : 'Try adjusting your filters.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedReviews.map((review) => (
                <div key={review.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Buyer Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{review.buyer_name_masked || 'Buyer'}</span>
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                            ))}
                          </div>
                          <span className="text-xs text-gray-400">{timeAgo(review.created_at)}</span>
                        </div>
                        {review.listing_title && (
                          <p className="text-xs text-gray-400 mt-0.5">Purchased: {review.listing_title}</p>
                        )}
                        {review.review ? (
                          <p className="text-sm text-gray-700 mt-2 leading-relaxed">{review.review}</p>
                        ) : (
                          <p className="text-sm text-gray-400 mt-2 italic">No written review</p>
                        )}
                      </div>
                    </div>

                    {/* Report Button */}
                    {user && user.id !== sellerId && (
                      <div className="flex-shrink-0">
                        {reportedIds.has(review.id) ? (
                          <span className="text-[10px] text-gray-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Reported
                          </span>
                        ) : (
                          <button
                            onClick={() => setReportModal({ open: true, reviewId: review.id })}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Report this review"
                          >
                            <Flag className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 7) {
                    page = i + 1;
                  } else if (currentPage <= 4) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 3) {
                    page = totalPages - 6 + i;
                  } else {
                    page = currentPage - 3 + i;
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 text-sm font-medium rounded-lg transition-all ${
                        currentPage === page ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Report Modal */}
      {reportModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setReportModal({ open: false, reviewId: null })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                  <Flag className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Report Review</h3>
                  <p className="text-xs text-gray-500">Help us maintain a fair marketplace</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason *</label>
                <div className="space-y-2">
                  {[
                    { value: 'spam', label: 'Spam or fake review' },
                    { value: 'offensive', label: 'Offensive or inappropriate language' },
                    { value: 'misleading', label: 'Misleading or false information' },
                    { value: 'harassment', label: 'Harassment or personal attack' },
                    { value: 'other', label: 'Other reason' },
                  ].map(opt => (
                    <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${reportReason === opt.value ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        name="report-reason"
                        value={opt.value}
                        checked={reportReason === opt.value}
                        onChange={e => setReportReason(e.target.value)}
                        className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Additional details (optional)</label>
                <textarea
                  value={reportDescription}
                  onChange={e => setReportDescription(e.target.value)}
                  placeholder="Provide more context..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-sm resize-none"
                  maxLength={500}
                />
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">False reports may result in action against your account. Only report genuine violations.</p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setReportModal({ open: false, reviewId: null }); setReportReason(''); setReportDescription(''); }}
                className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleReport}
                disabled={!reportReason || submittingReport}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default SellerReviewsView;
