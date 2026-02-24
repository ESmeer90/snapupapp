import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSellerOrders, getPayouts, getSellerEarnings, formatZAR, timeAgo } from '@/lib/api';
import type { SellerOrder, Payout, SellerEarnings } from '@/types';
import {
  downloadCSV,
  filterByDateRange,
  formatExportDate,
  formatExportDateTime,
  formatExportZAR,
  generateFilename,
  toCSV,
  downloadFile,
} from '@/lib/export';
import {
  FileSpreadsheet, Download, Calendar, TrendingUp, Receipt,
  Loader2, CheckCircle2, AlertTriangle, DollarSign, Wallet,
  BarChart3, Package, ArrowUpRight, Banknote, Building2,
  ChevronDown, ChevronUp, FileText, X
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

type ReportType = 'sales' | 'revenue' | 'payouts' | 'full';

interface SalesReportExportProps {
  isOpen: boolean;
  onClose: () => void;
}

const SalesReportExport: React.FC<SalesReportExportProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [earnings, setEarnings] = useState<SellerEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reportType, setReportType] = useState<ReportType>('full');
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [ordersRes, payoutsRes, earningsRes] = await Promise.allSettled([
        getSellerOrders(user.id),
        getPayouts(),
        getSellerEarnings(),
      ]);
      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value);
      if (payoutsRes.status === 'fulfilled') setPayouts(payoutsRes.value);
      if (earningsRes.status === 'fulfilled') setEarnings(earningsRes.value);
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to load sales data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen, loadData]);

  // Filtered data
  const filteredOrders = useMemo(() => {
    return filterByDateRange(orders, 'created_at', startDate || null, endDate || null);
  }, [orders, startDate, endDate]);

  const filteredPayouts = useMemo(() => {
    return filterByDateRange(payouts, 'created_at', startDate || null, endDate || null);
  }, [payouts, startDate, endDate]);

  // Revenue stats
  const revenueStats = useMemo(() => {
    const paidOrders = filteredOrders.filter(o => ['paid', 'shipped', 'delivered'].includes(o.status));
    const grossRevenue = paidOrders.reduce((s, o) => s + (o.amount || 0), 0);
    const totalFees = paidOrders.reduce((s, o) => s + (o.service_fee || 0), 0);
    const netEarnings = grossRevenue - totalFees;
    const avgOrderValue = paidOrders.length > 0 ? grossRevenue / paidOrders.length : 0;
    const completedPayouts = filteredPayouts
      .filter(p => p.status === 'completed')
      .reduce((s, p) => s + p.amount, 0);
    const pendingPayouts = filteredPayouts
      .filter(p => ['pending', 'approved', 'processing'].includes(p.status))
      .reduce((s, p) => s + p.amount, 0);

    // Commission breakdown by tier
    const under500 = paidOrders.filter(o => o.amount < 500);
    const mid = paidOrders.filter(o => o.amount >= 500 && o.amount <= 2000);
    const over2000 = paidOrders.filter(o => o.amount > 2000);

    return {
      totalOrders: filteredOrders.length,
      paidOrders: paidOrders.length,
      grossRevenue,
      totalFees,
      netEarnings,
      avgOrderValue,
      completedPayouts,
      pendingPayouts,
      deliveredOrders: filteredOrders.filter(o => o.status === 'delivered').length,
      cancelledOrders: filteredOrders.filter(o => o.status === 'cancelled').length,
      pendingOrders: filteredOrders.filter(o => ['pending', 'paid'].includes(o.status)).length,
      shippedOrders: filteredOrders.filter(o => o.status === 'shipped').length,
      tier12: { count: under500.length, revenue: under500.reduce((s, o) => s + o.amount, 0), fees: under500.reduce((s, o) => s + o.service_fee, 0) },
      tier10: { count: mid.length, revenue: mid.reduce((s, o) => s + o.amount, 0), fees: mid.reduce((s, o) => s + o.service_fee, 0) },
      tier5: { count: over2000.length, revenue: over2000.reduce((s, o) => s + o.amount, 0), fees: over2000.reduce((s, o) => s + o.service_fee, 0) },
    };
  }, [filteredOrders, filteredPayouts]);

  const setDatePreset = (preset: string) => {
    const now = new Date();
    let start: Date;
    switch (preset) {
      case '7d': start = new Date(now.getTime() - 7 * 86400000); break;
      case '30d': start = new Date(now.getTime() - 30 * 86400000); break;
      case '90d': start = new Date(now.getTime() - 90 * 86400000); break;
      case 'ytd': start = new Date(now.getFullYear(), 0, 1); break;
      case 'all': setStartDate(''); setEndDate(''); return;
      default: return;
    }
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(now.toISOString().slice(0, 10));
  };

  const handleExport = () => {
    setExporting(true);

    setTimeout(() => {
      try {
        if (reportType === 'sales' || reportType === 'full') {
          exportSalesCSV();
        }
        if (reportType === 'revenue' || reportType === 'full') {
          exportRevenueCSV();
        }
        if (reportType === 'payouts' || reportType === 'full') {
          exportPayoutsCSV();
        }
        setExported(true);
        setTimeout(() => setExported(false), 3000);
        toast({ title: 'Export Complete', description: `Sales report downloaded successfully.` });
      } catch (err: any) {
        toast({ title: 'Export Failed', description: err.message || 'Failed to generate report', variant: 'destructive' });
      } finally {
        setExporting(false);
      }
    }, 500);
  };

  const exportSalesCSV = () => {
    const headers = [
      { key: 'order_id', label: 'Order ID' },
      { key: 'date', label: 'Date' },
      { key: 'item_title', label: 'Item' },
      { key: 'buyer', label: 'Buyer' },
      { key: 'amount', label: 'Sale Amount' },
      { key: 'service_fee', label: 'Commission Fee' },
      { key: 'net_amount', label: 'Net Amount' },
      { key: 'commission_rate', label: 'Commission Rate' },
      { key: 'status', label: 'Status' },
      { key: 'tracking_number', label: 'Tracking Number' },
      { key: 'carrier', label: 'Carrier' },
      { key: 'tracking_status', label: 'Tracking Status' },
    ];

    const rows = filteredOrders.map(order => {
      const rate = order.amount < 500 ? '12%' : order.amount <= 2000 ? '10%' : '5%';
      return {
        order_id: order.id.slice(0, 8).toUpperCase(),
        date: formatExportDateTime(order.created_at),
        item_title: order.listing_title || 'Item',
        buyer: order.buyer_name_masked || 'Buyer',
        amount: formatExportZAR(order.amount || 0),
        service_fee: formatExportZAR(order.service_fee || 0),
        net_amount: formatExportZAR((order.amount || 0) - (order.service_fee || 0)),
        commission_rate: rate,
        status: (order.status || '').charAt(0).toUpperCase() + (order.status || '').slice(1),
        tracking_number: order.tracking_number || '',
        carrier: order.carrier || '',
        tracking_status: order.tracking_status || '',
      };
    });

    downloadCSV(headers, rows, generateFilename('snapup_sales_orders'));
  };

  const exportRevenueCSV = () => {
    const lines: string[] = [];
    lines.push('SnapUp Sales Revenue Report');
    lines.push(`Generated: ${new Date().toLocaleString('en-ZA')}`);
    lines.push(`Period: ${startDate || 'All time'} to ${endDate || 'Present'}`);
    lines.push('');
    lines.push('REVENUE SUMMARY');
    lines.push(`Metric,Value`);
    lines.push(`Total Orders,${revenueStats.totalOrders}`);
    lines.push(`Paid Orders,${revenueStats.paidOrders}`);
    lines.push(`Gross Revenue,${formatExportZAR(revenueStats.grossRevenue)}`);
    lines.push(`Total Commission Fees,${formatExportZAR(revenueStats.totalFees)}`);
    lines.push(`Net Earnings,${formatExportZAR(revenueStats.netEarnings)}`);
    lines.push(`Average Order Value,${formatExportZAR(revenueStats.avgOrderValue)}`);
    lines.push('');
    lines.push('ORDER STATUS BREAKDOWN');
    lines.push(`Status,Count`);
    lines.push(`Delivered,${revenueStats.deliveredOrders}`);
    lines.push(`Shipped,${revenueStats.shippedOrders}`);
    lines.push(`Pending/Paid,${revenueStats.pendingOrders}`);
    lines.push(`Cancelled,${revenueStats.cancelledOrders}`);
    lines.push('');
    lines.push('COMMISSION BREAKDOWN BY TIER');
    lines.push(`Tier,Orders,Revenue,Fees`);
    lines.push(`Under R500 (12%),${revenueStats.tier12.count},${formatExportZAR(revenueStats.tier12.revenue)},${formatExportZAR(revenueStats.tier12.fees)}`);
    lines.push(`R500-R2000 (10%),${revenueStats.tier10.count},${formatExportZAR(revenueStats.tier10.revenue)},${formatExportZAR(revenueStats.tier10.fees)}`);
    lines.push(`Over R2000 (5%),${revenueStats.tier5.count},${formatExportZAR(revenueStats.tier5.revenue)},${formatExportZAR(revenueStats.tier5.fees)}`);
    lines.push('');
    lines.push('PAYOUT SUMMARY');
    lines.push(`Metric,Value`);
    lines.push(`Completed Payouts,${formatExportZAR(revenueStats.completedPayouts)}`);
    lines.push(`Pending Payouts,${formatExportZAR(revenueStats.pendingPayouts)}`);
    if (earnings) {
      lines.push(`Available Balance,${formatExportZAR(earnings.available_balance)}`);
    }

    downloadFile(lines.join('\n'), generateFilename('snapup_revenue_summary'), 'text/csv');
  };

  const exportPayoutsCSV = () => {
    if (filteredPayouts.length === 0) return;

    const headers = [
      { key: 'reference', label: 'Reference' },
      { key: 'date_requested', label: 'Date Requested' },
      { key: 'amount', label: 'Amount' },
      { key: 'status', label: 'Status' },
      { key: 'bank_name', label: 'Bank' },
      { key: 'account', label: 'Account' },
      { key: 'date_processed', label: 'Date Processed' },
      { key: 'admin_notes', label: 'Notes' },
    ];

    const rows = filteredPayouts.map(p => ({
      reference: p.reference || p.id.slice(0, 8).toUpperCase(),
      date_requested: formatExportDateTime(p.created_at),
      amount: formatExportZAR(p.amount),
      status: (p.status || '').charAt(0).toUpperCase() + (p.status || '').slice(1),
      bank_name: p.bank_name || '',
      account: p.account_number_masked || '',
      date_processed: p.processed_at ? formatExportDateTime(p.processed_at) : '',
      admin_notes: p.admin_notes || '',
    }));

    downloadCSV(headers, rows, generateFilename('snapup_payout_history'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Sales Report</h2>
                <p className="text-xs text-gray-500">Export revenue summaries, fees & payout history</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Loading sales data...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Report Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Report Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { value: 'full' as ReportType, label: 'Full Report', icon: <FileSpreadsheet className="w-4 h-4" />, desc: 'All data' },
                    { value: 'sales' as ReportType, label: 'Sales Orders', icon: <Package className="w-4 h-4" />, desc: 'Order details' },
                    { value: 'revenue' as ReportType, label: 'Revenue', icon: <TrendingUp className="w-4 h-4" />, desc: 'Summary' },
                    { value: 'payouts' as ReportType, label: 'Payouts', icon: <Banknote className="w-4 h-4" />, desc: 'History' },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setReportType(opt.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all ${
                        reportType === opt.value
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.icon}
                      <span className="text-xs font-semibold">{opt.label}</span>
                      <span className="text-[10px] text-gray-400">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Range */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1.5 text-gray-400" />
                  Date Range
                </label>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {[
                    { label: '7 days', value: '7d' },
                    { label: '30 days', value: '30d' },
                    { label: '90 days', value: '90d' },
                    { label: 'YTD', value: 'ytd' },
                    { label: 'All', value: 'all' },
                  ].map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => setDatePreset(preset.value)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">From</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">To</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Revenue Dashboard Preview */}
              <div className="bg-gradient-to-br from-gray-50 to-indigo-50/30 rounded-xl border border-gray-200 p-4 space-y-4">
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  Revenue Overview
                </h4>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-gray-100 text-center">
                    <p className="text-xs text-gray-500">Gross Revenue</p>
                    <p className="text-lg font-bold text-gray-900">{formatZAR(revenueStats.grossRevenue)}</p>
                    <p className="text-[10px] text-gray-400">{revenueStats.paidOrders} orders</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-100 text-center">
                    <p className="text-xs text-gray-500">Commission</p>
                    <p className="text-lg font-bold text-red-600">{formatZAR(revenueStats.totalFees)}</p>
                    <p className="text-[10px] text-gray-400">
                      {revenueStats.grossRevenue > 0
                        ? `${((revenueStats.totalFees / revenueStats.grossRevenue) * 100).toFixed(1)}% avg`
                        : '0%'}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-100 text-center">
                    <p className="text-xs text-gray-500">Net Earnings</p>
                    <p className="text-lg font-bold text-emerald-600">{formatZAR(revenueStats.netEarnings)}</p>
                    <p className="text-[10px] text-gray-400">After fees</p>
                  </div>
                </div>

                {/* Commission Tier Breakdown */}
                <div className="bg-white rounded-lg border border-gray-100 p-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Commission by Tier</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Under R500 (12%)', ...revenueStats.tier12, color: 'bg-red-400' },
                      { label: 'R500-R2,000 (10%)', ...revenueStats.tier10, color: 'bg-amber-400' },
                      { label: 'Over R2,000 (5%)', ...revenueStats.tier5, color: 'bg-emerald-400' },
                    ].map((tier, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${tier.color}`} />
                        <span className="text-xs text-gray-600 flex-1">{tier.label}</span>
                        <span className="text-xs font-medium text-gray-700">{tier.count} orders</span>
                        <span className="text-xs font-mono text-gray-500">{formatZAR(tier.fees)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payout Summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <p className="text-xs text-gray-500">Paid Out</p>
                    </div>
                    <p className="text-base font-bold text-emerald-600">{formatZAR(revenueStats.completedPayouts)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Wallet className="w-3.5 h-3.5 text-amber-500" />
                      <p className="text-xs text-gray-500">Pending</p>
                    </div>
                    <p className="text-base font-bold text-amber-600">{formatZAR(revenueStats.pendingPayouts)}</p>
                  </div>
                </div>
              </div>

              {/* What's included */}
              <div className="bg-blue-50 rounded-xl border border-blue-100 p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1.5">
                  <FileText className="w-3.5 h-3.5 inline mr-1" />
                  Export includes:
                </p>
                <div className="flex flex-wrap gap-2">
                  {reportType === 'full' || reportType === 'sales' ? (
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full">
                      Sales Orders ({filteredOrders.length})
                    </span>
                  ) : null}
                  {reportType === 'full' || reportType === 'revenue' ? (
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-indigo-100 text-indigo-700 rounded-full">
                      Revenue Summary
                    </span>
                  ) : null}
                  {reportType === 'full' || reportType === 'payouts' ? (
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded-full">
                      Payout History ({filteredPayouts.length})
                    </span>
                  ) : null}
                </div>
                {reportType === 'full' && (
                  <p className="text-[10px] text-blue-600 mt-1.5">
                    Full report downloads multiple CSV files: sales orders, revenue summary, and payout history.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center justify-between">
          <p className="text-xs text-gray-400">
            <FileText className="w-3.5 h-3.5 inline mr-1" />
            CSV format, Excel compatible
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={loading || exporting || (filteredOrders.length === 0 && filteredPayouts.length === 0)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${
                exported
                  ? 'bg-emerald-600 text-white shadow-emerald-200'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
              }`}
            >
              {exporting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
              ) : exported ? (
                <><CheckCircle2 className="w-4 h-4" /> Downloaded!</>
              ) : (
                <><Download className="w-4 h-4" /> Export Report</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesReportExport;
