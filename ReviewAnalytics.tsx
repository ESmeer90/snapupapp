import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getSellerRatings, getSellerRatingSummary, timeAgo } from '@/lib/api';
import type { SellerRating } from '@/types';
import {
  BarChart3, Star, TrendingUp, TrendingDown, MessageSquare, Clock,
  Loader2, Hash, ArrowUp, ArrowDown, Minus, Calendar
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface ReviewAnalyticsProps {
  sellerId?: string;
}

interface MonthlyData {
  month: string; // YYYY-MM
  label: string; // "Jan 2026"
  count: number;
  avgRating: number;
  ratings: number[];
}

// Common stop words to exclude from keyword extraction
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'it', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall',
  'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
  'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
  'only', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'as', 'until',
  'while', 'about', 'between', 'through', 'during', 'before', 'after', 'above',
  'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'am', 'are', 'if', 'also',
  'really', 'item', 'product', 'seller', 'bought', 'got', 'get', 'like', 'much',
  'well', 'even', 'still', 'back', 'going', 'way', 'make', 'made', 'know', 'take',
  'come', 'came', 'went', 'said', 'one', 'two', 'three', 'first', 'new', 'now',
  'time', 'long', 'little', 'own', 'old', 'right', 'big', 'high', 'different',
  'small', 'large', 'next', 'early', 'young', 'important', 'last', 'good', 'great',
  'bad', 'nice', 'thank', 'thanks', 'yes', 'no', 'okay', 'ok', 'sure', 'please',
  'would', 'could', 'should', 'dont', 'didnt', 'wont', 'cant', 'its', 'thats',
  'very', 'quite', 'rather', 'bit', 'lot', 'lots', 'many', 'much', 'thing', 'things',
]);

function extractKeywords(reviews: SellerRating[]): { word: string; count: number; sentiment: 'positive' | 'negative' | 'neutral' }[] {
  const wordCounts: Record<string, number> = {};
  const positiveWords = new Set(['excellent', 'amazing', 'perfect', 'fast', 'quick', 'friendly', 'helpful', 'professional', 'recommended', 'reliable', 'honest', 'responsive', 'fantastic', 'wonderful', 'awesome', 'superb', 'brilliant', 'smooth', 'easy', 'clean', 'quality', 'genuine', 'trustworthy', 'efficient', 'prompt', 'polite', 'satisfied', 'happy', 'love', 'best', 'top', 'outstanding', 'exceptional', 'impressed', 'delivered', 'packaged']);
  const negativeWords = new Set(['slow', 'late', 'damaged', 'broken', 'poor', 'terrible', 'awful', 'worst', 'rude', 'dishonest', 'scam', 'fake', 'disappointing', 'disappointed', 'horrible', 'unresponsive', 'delayed', 'missing', 'wrong', 'defective', 'dirty', 'cheap', 'overpriced', 'unprofessional', 'avoid', 'waste', 'refund', 'complaint', 'problem', 'issue']);

  for (const review of reviews) {
    if (!review.review) continue;
    const words = review.review.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    const seen = new Set<string>();
    for (const word of words) {
      if (!seen.has(word)) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
        seen.add(word);
      }
    }
  }

  return Object.entries(wordCounts)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({
      word,
      count,
      sentiment: positiveWords.has(word) ? 'positive' : negativeWords.has(word) ? 'negative' : 'neutral',
    }));
}

const ReviewAnalytics: React.FC<ReviewAnalyticsProps> = ({ sellerId }) => {
  const { user } = useAuth();
  const effectiveSellerId = sellerId || user?.id;
  const [reviews, setReviews] = useState<SellerRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [responseRate, setResponseRate] = useState<number | null>(null);

  useEffect(() => {
    if (!effectiveSellerId) return;
    loadData();
  }, [effectiveSellerId]);

  const loadData = async () => {
    if (!effectiveSellerId) return;
    setLoading(true);
    try {
      // Get all reviews with full data
      const { data: ratingsData, error } = await supabase
        .from('seller_ratings')
        .select('*')
        .eq('seller_id', effectiveSellerId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setReviews((ratingsData || []) as SellerRating[]);

      // Calculate response rate: how many reviews have the seller replied to
      // We'll check if seller has sent a message to the buyer after a review was left
      try {
        const reviewsWithOrders = (ratingsData || []).filter((r: any) => r.order_id);
        if (reviewsWithOrders.length > 0) {
          // Simple heuristic: count reviews where seller has sent at least one message
          // to the buyer after the review date
          let responded = 0;
          for (const review of reviewsWithOrders.slice(0, 20)) { // limit to recent 20
            const { count } = await supabase
              .from('messages')
              .select('*', { count: 'exact', head: true })
              .eq('sender_id', effectiveSellerId)
              .eq('receiver_id', (review as any).buyer_id)
              .gte('created_at', (review as any).created_at);
            if ((count || 0) > 0) responded++;
          }
          const checked = Math.min(reviewsWithOrders.length, 20);
          setResponseRate(checked > 0 ? Math.round((responded / checked) * 100) : null);
        }
      } catch {
        // Response rate is optional
      }
    } catch (err: any) {
      console.error('Failed to load review analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  // Compute monthly data
  const monthlyData = useMemo((): MonthlyData[] => {
    if (reviews.length === 0) return [];

    const monthMap = new Map<string, { ratings: number[]; count: number }>();

    for (const review of reviews) {
      const date = new Date(review.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(key)) {
        monthMap.set(key, { ratings: [], count: 0 });
      }
      const entry = monthMap.get(key)!;
      entry.ratings.push(review.rating);
      entry.count++;
    }

    // Fill in missing months
    const sortedKeys = Array.from(monthMap.keys()).sort();
    if (sortedKeys.length === 0) return [];

    const start = new Date(sortedKeys[0] + '-01');
    const end = new Date();
    const result: MonthlyData[] = [];

    const current = new Date(start);
    while (current <= end) {
      const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthMap.get(key);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      result.push({
        month: key,
        label: `${monthNames[current.getMonth()]} ${current.getFullYear()}`,
        count: entry?.count || 0,
        avgRating: entry ? Math.round((entry.ratings.reduce((s, r) => s + r, 0) / entry.ratings.length) * 10) / 10 : 0,
        ratings: entry?.ratings || [],
      });
      current.setMonth(current.getMonth() + 1);
    }

    // Only show last 12 months
    return result.slice(-12);
  }, [reviews]);

  const keywords = useMemo(() => extractKeywords(reviews), [reviews]);

  // Trend calculation
  const recentTrend = useMemo(() => {
    if (monthlyData.length < 2) return null;
    const recent = monthlyData.slice(-3).filter(m => m.count > 0);
    const older = monthlyData.slice(-6, -3).filter(m => m.count > 0);
    if (recent.length === 0 || older.length === 0) return null;

    const recentAvg = recent.reduce((s, m) => s + m.avgRating, 0) / recent.length;
    const olderAvg = older.reduce((s, m) => s + m.avgRating, 0) / older.length;
    const diff = recentAvg - olderAvg;

    return {
      direction: diff > 0.1 ? 'up' : diff < -0.1 ? 'down' : 'stable',
      diff: Math.abs(diff).toFixed(1),
      recentAvg: recentAvg.toFixed(1),
    };
  }, [monthlyData]);

  const maxMonthCount = Math.max(...monthlyData.map(m => m.count), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700 mb-1">No Review Data</h3>
        <p className="text-sm text-gray-500">Analytics will appear once you receive reviews from buyers.</p>
      </div>
    );
  }

  const totalReviews = reviews.length;
  const avgRating = reviews.reduce((s, r) => s + r.rating, 0) / totalReviews;
  const reviewsWithText = reviews.filter(r => r.review && r.review.trim().length > 0).length;
  const textRate = Math.round((reviewsWithText / totalReviews) * 100);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
              <Star className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{avgRating.toFixed(1)}</p>
          <p className="text-xs text-gray-500">Average Rating</p>
          {recentTrend && (
            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${
              recentTrend.direction === 'up' ? 'text-emerald-600' :
              recentTrend.direction === 'down' ? 'text-red-600' : 'text-gray-500'
            }`}>
              {recentTrend.direction === 'up' ? <ArrowUp className="w-3 h-3" /> :
               recentTrend.direction === 'down' ? <ArrowDown className="w-3 h-3" /> :
               <Minus className="w-3 h-3" />}
              {recentTrend.diff} vs prev 3mo
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalReviews}</p>
          <p className="text-xs text-gray-500">Total Reviews</p>
          <p className="text-xs text-gray-400 mt-1">{reviewsWithText} with text ({textRate}%)</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {monthlyData.length > 0 ? (monthlyData.filter(m => m.count > 0).reduce((s, m) => s + m.count, 0) / Math.max(monthlyData.filter(m => m.count > 0).length, 1)).toFixed(1) : '0'}
          </p>
          <p className="text-xs text-gray-500">Avg Reviews/Month</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {responseRate !== null ? `${responseRate}%` : 'N/A'}
          </p>
          <p className="text-xs text-gray-500">Response Rate</p>
          <p className="text-xs text-gray-400 mt-1">to reviews</p>
        </div>
      </div>

      {/* Reviews Per Month Chart */}
      {monthlyData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            Reviews Per Month
          </h3>
          <div className="flex items-end gap-1.5 h-40">
            {monthlyData.map((m, i) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                  <div className="bg-gray-900 text-white text-[10px] px-2 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                    <p className="font-semibold">{m.label}</p>
                    <p>{m.count} review{m.count !== 1 ? 's' : ''}</p>
                    {m.avgRating > 0 && <p>Avg: {m.avgRating}/5</p>}
                  </div>
                </div>
                {/* Bar */}
                <div
                  className={`w-full rounded-t-md transition-all duration-300 cursor-pointer ${
                    m.count === 0 ? 'bg-gray-100' :
                    m.avgRating >= 4.5 ? 'bg-emerald-400 hover:bg-emerald-500' :
                    m.avgRating >= 3.5 ? 'bg-blue-400 hover:bg-blue-500' :
                    m.avgRating >= 2.5 ? 'bg-amber-400 hover:bg-amber-500' :
                    'bg-red-400 hover:bg-red-500'
                  }`}
                  style={{
                    height: m.count > 0 ? `${Math.max((m.count / maxMonthCount) * 100, 8)}%` : '4px',
                  }}
                />
                {/* Count label */}
                {m.count > 0 && (
                  <span className="text-[9px] font-semibold text-gray-500">{m.count}</span>
                )}
                {/* Month label */}
                <span className="text-[8px] text-gray-400 truncate w-full text-center">
                  {m.label.split(' ')[0]}
                </span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-400 rounded" /> 4.5+</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-400 rounded" /> 3.5-4.4</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-amber-400 rounded" /> 2.5-3.4</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-400 rounded" /> Below 2.5</span>
          </div>
        </div>
      )}

      {/* Rating Trend Line */}
      {monthlyData.filter(m => m.count > 0).length >= 2 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            Average Rating Trend
          </h3>
          <div className="relative h-32">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between text-[9px] text-gray-400 py-1">
              <span>5.0</span>
              <span>3.0</span>
              <span>1.0</span>
            </div>
            {/* Chart area */}
            <div className="ml-10 h-full flex items-end gap-1">
              {monthlyData.map((m) => {
                if (m.count === 0) return (
                  <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div className="w-full h-0.5 bg-gray-100 rounded" />
                    <span className="text-[8px] text-gray-300 mt-1">{m.label.split(' ')[0]}</span>
                  </div>
                );
                const heightPct = ((m.avgRating - 1) / 4) * 100;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                      <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded-lg whitespace-nowrap">
                        {m.label}: {m.avgRating}/5
                      </div>
                    </div>
                    <div className="w-full flex flex-col items-center" style={{ height: `${heightPct}%`, minHeight: '8px' }}>
                      <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm flex-shrink-0 cursor-pointer hover:scale-125 transition-transform" />
                      <div className="w-0.5 flex-1 bg-blue-300" />
                    </div>
                    <span className="text-[8px] text-gray-400 mt-1">{m.label.split(' ')[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Keywords / Common Words */}
      {keywords.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Hash className="w-4 h-4 text-purple-600" />
            Common Review Keywords
          </h3>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw.word}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all cursor-default ${
                  kw.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  kw.sentiment === 'negative' ? 'bg-red-50 text-red-700 border border-red-200' :
                  'bg-gray-50 text-gray-600 border border-gray-200'
                }`}
                style={{
                  fontSize: `${Math.min(Math.max(kw.count * 1.5 + 10, 12), 18)}px`,
                }}
              >
                {kw.word}
                <span className={`text-[10px] font-normal px-1 py-0.5 rounded-full ${
                  kw.sentiment === 'positive' ? 'bg-emerald-100' :
                  kw.sentiment === 'negative' ? 'bg-red-100' :
                  'bg-gray-100'
                }`}>
                  {kw.count}
                </span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-400 rounded-full" /> Positive</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-full" /> Negative</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-400 rounded-full" /> Neutral</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewAnalytics;
