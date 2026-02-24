import React, { useState, useMemo } from 'react';
import type { Order } from '@/types';
import { formatZAR } from '@/lib/api';
import { calculateCommission } from '@/lib/commission';
import {
  downloadCSV,
  filterByDateRange,
  formatExportDate,
  formatExportDateTime,
  formatExportZAR,
  generateFilename,
} from '@/lib/export';
import {
  X, Download, Calendar, FileSpreadsheet, Filter, Eye,
  Package, ArrowDownLeft, ArrowUpRight, Loader2, CheckCircle2,
  AlertTriangle, FileText, ChevronDown, ChevronUp, Shield
} from 'lucide-react';

// POPIA-compliant name masking: "John Smith" → "J. S***"
function maskName(name: string | undefined | null): string {
  if (!name || name.trim().length === 0) return 'Anonymous';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase() + '***';
  }
  const firstInitial = parts[0].charAt(0).toUpperCase();
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${firstInitial}. ${lastInitial}***`;
}

interface ExportOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  userId: string;
}

const ExportOrdersModal: React.FC<ExportOrdersModalProps> = ({
  isOpen,
  onClose,
  orders,
  userId,
}) => {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [exportType, setExportType] = useState<'all' | 'purchases' | 'sales'>('all');
  const [includeTracking, setIncludeTracking] = useState(true);
  const [includeFees, setIncludeFees] = useState(true);
  const [includeCommission, setIncludeCommission] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [activePreset, setActivePreset] = useState<string>('all');

  // Filter orders based on criteria
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Filter by type
    if (exportType === 'purchases') {
      result = result.filter(o => o.buyer_id === userId);
    } else if (exportType === 'sales') {
      result = result.filter(o => o.seller_id === userId);
    }

    // Filter by date range
    result = filterByDateRange(result, 'created_at', startDate || null, endDate || null);

    return result;
  }, [orders, exportType, startDate, endDate, userId]);

  // Summary stats
  const stats = useMemo(() => {
    const purchases = filteredOrders.filter(o => o.buyer_id === userId);
    const sales = filteredOrders.filter(o => o.seller_id === userId);
    const totalCommission = sales.reduce((s, o) => {
      const comm = o.commission_amount ?? calculateCommission(o.amount || 0).commissionAmount;
      return s + comm;
    }, 0);
    const totalNetSeller = sales.reduce((s, o) => {
      const net = o.net_seller_amount ?? calculateCommission(o.amount || 0).netSellerAmount;
      return s + net;
    }, 0);
    return {
      total: filteredOrders.length,
      purchases: purchases.length,
      sales: sales.length,
      totalSpent: purchases.reduce((s, o) => s + (o.total || 0), 0),
      totalEarned: sales.reduce((s, o) => s + (o.amount || 0), 0),
      totalFees: sales.reduce((s, o) => s + (o.service_fee || 0), 0),
      totalCommission,
      totalNetSeller,
      delivered: filteredOrders.filter(o => o.status === 'delivered').length,
      pending: filteredOrders.filter(o => o.status === 'pending').length,
      shipped: filteredOrders.filter(o => o.status === 'shipped').length,
      cancelled: filteredOrders.filter(o => o.status === 'cancelled').length,
    };
  }, [filteredOrders, userId]);

  const handleExport = () => {
    if (filteredOrders.length === 0) return;
    setExporting(true);

    // Build headers - all requested columns
    const headers: { key: string; label: string }[] = [
      { key: 'order_ref', label: 'Order Reference' },
      { key: 'listing_title', label: 'Listing Title' },
      { key: 'amount', label: 'Amount (ZAR)' },
    ];

    if (includeFees) {
      headers.push({ key: 'service_fee', label: 'Service Fee (ZAR)' });
      headers.push({ key: 'total', label: 'Total (ZAR)' });
    }

    if (includeCommission) {
      headers.push({ key: 'commission', label: 'Commission (ZAR)' });
      headers.push({ key: 'commission_rate', label: 'Commission Rate' });
      headers.push({ key: 'net_seller_amount', label: 'Net Seller Amount (ZAR)' });
    }

    headers.push({ key: 'status', label: 'Status' });

    if (includeTracking) {
      headers.push({ key: 'tracking_number', label: 'Tracking Number' });
      headers.push({ key: 'courier', label: 'Courier' });
      headers.push({ key: 'tracking_status', label: 'Tracking Status' });
    }

    // POPIA-masked names
    headers.push({ key: 'buyer_name', label: 'Buyer (Masked)' });
    headers.push({ key: 'seller_name', label: 'Seller (Masked)' });
    headers.push({ key: 'type', label: 'Transaction Type' });
    headers.push({ key: 'created_at', label: 'Created Date' });
    headers.push({ key: 'updated_at', label: 'Updated Date' });

    // Build rows
    const rows = filteredOrders.map(order => {
      const isBuyer = order.buyer_id === userId;
      const commBreakdown = calculateCommission(order.amount || 0);
      const commission = order.commission_amount ?? commBreakdown.commissionAmount;
      const netSeller = order.net_seller_amount ?? commBreakdown.netSellerAmount;
      const commRate = commBreakdown.commissionRate;

      return {
        order_ref: `#${order.id.slice(0, 8).toUpperCase()}`,
        listing_title: order.listing_title || 'Item',
        amount: formatExportZAR(order.amount || 0),
        service_fee: formatExportZAR(order.service_fee || 0),
        total: formatExportZAR(order.total || 0),
        commission: formatExportZAR(commission),
        commission_rate: `${Math.round(commRate * 100)}%`,
        net_seller_amount: formatExportZAR(netSeller),
        status: (order.status || 'unknown').charAt(0).toUpperCase() + (order.status || 'unknown').slice(1),
        tracking_number: order.tracking_number || '',
        courier: order.carrier || '',
        tracking_status: order.tracking_status || '',
        buyer_name: maskName(order.buyer_name),
        seller_name: maskName(order.seller_name),
        type: isBuyer ? 'Purchase' : 'Sale',
        created_at: formatExportDateTime(order.created_at),
        updated_at: formatExportDateTime(order.updated_at),
      };
    });

    // Generate filename
    const typeLabel = exportType === 'all' ? 'orders' : exportType;
    const filename = generateFilename(`snapup_${typeLabel}`);

    // Download
    setTimeout(() => {
      downloadCSV(headers, rows, filename);
      setExporting(false);
      setExported(true);
      setTimeout(() => setExported(false), 3000);
    }, 500);
  };

  // Quick date presets
  const setDatePreset = (preset: string) => {
    setActivePreset(preset);
    const now = new Date();
    let start: Date;
    switch (preset) {
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'ytd':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all':
        setStartDate('');
        setEndDate('');
        return;
      default:
        return;
    }
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(now.toISOString().slice(0, 10));
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
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                <FileSpreadsheet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Export Orders</h2>
                <p className="text-xs text-gray-500">Download your order history as CSV</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Order Type Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Export Type</label>
            <div className="flex items-center gap-2">
              {([
                { value: 'all', label: 'All Orders', icon: <Package className="w-3.5 h-3.5" /> },
                { value: 'purchases', label: 'Purchases', icon: <ArrowDownLeft className="w-3.5 h-3.5" /> },
                { value: 'sales', label: 'Sales', icon: <ArrowUpRight className="w-3.5 h-3.5" /> },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setExportType(opt.value)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border transition-all ${
                    exportType === opt.value
                      ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
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
                { label: 'Last 7 days', value: '7d' },
                { label: 'Last 30 days', value: '30d' },
                { label: 'Last 90 days', value: '90d' },
                { label: 'Year to date', value: 'ytd' },
                { label: 'All time', value: 'all' },
              ].map(preset => (
                <button
                  key={preset.value}
                  onClick={() => setDatePreset(preset.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    activePreset === preset.value
                      ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                      : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                  }`}
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
                  onChange={e => { setStartDate(e.target.value); setActivePreset(''); }}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setActivePreset(''); }}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Options */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-1.5 text-gray-400" />
              Include Columns
            </label>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTracking}
                  onChange={e => setIncludeTracking(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Tracking info</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFees}
                  onChange={e => setIncludeFees(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Fees & totals</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCommission}
                  onChange={e => setIncludeCommission(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Commission breakdown</span>
              </label>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Export Summary</h4>
              <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-lg border border-gray-200">
                {stats.total} order{stats.total !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                <p className="text-xs text-gray-500">Purchases</p>
                <p className="text-lg font-bold text-blue-600">{stats.purchases}</p>
                <p className="text-xs text-gray-400">{formatZAR(stats.totalSpent)}</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                <p className="text-xs text-gray-500">Sales</p>
                <p className="text-lg font-bold text-emerald-600">{stats.sales}</p>
                <p className="text-xs text-gray-400">{formatZAR(stats.totalEarned)}</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                <p className="text-xs text-gray-500">Commission</p>
                <p className="text-lg font-bold text-red-500">{formatZAR(stats.totalCommission)}</p>
                <p className="text-xs text-gray-400">Deducted</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                <p className="text-xs text-gray-500">Net Seller</p>
                <p className="text-lg font-bold text-gray-900">{formatZAR(stats.totalNetSeller)}</p>
                <p className="text-xs text-gray-400">After commission</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <div className="text-center p-1.5 bg-white rounded-lg border border-gray-100">
                <p className="text-xs text-emerald-600 font-bold">{stats.delivered}</p>
                <p className="text-[10px] text-gray-400">Delivered</p>
              </div>
              <div className="text-center p-1.5 bg-white rounded-lg border border-gray-100">
                <p className="text-xs text-blue-600 font-bold">{stats.shipped}</p>
                <p className="text-[10px] text-gray-400">Shipped</p>
              </div>
              <div className="text-center p-1.5 bg-white rounded-lg border border-gray-100">
                <p className="text-xs text-amber-600 font-bold">{stats.pending}</p>
                <p className="text-[10px] text-gray-400">Pending</p>
              </div>
              <div className="text-center p-1.5 bg-white rounded-lg border border-gray-100">
                <p className="text-xs text-red-500 font-bold">{stats.cancelled}</p>
                <p className="text-[10px] text-gray-400">Cancelled</p>
              </div>
            </div>
          </div>

          {/* POPIA Notice */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-700">POPIA Compliance</p>
              <p className="text-[11px] text-blue-600 mt-0.5">
                Buyer and seller names are masked in the export (e.g. "J. S***") to comply with the Protection of Personal Information Act.
                Full names are never included in exported files.
              </p>
            </div>
          </div>

          {/* Preview Toggle */}
          {filteredOrders.length > 0 && (
            <div>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-all"
              >
                <Eye className="w-4 h-4" />
                {showPreview ? 'Hide' : 'Show'} Preview
                {showPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showPreview && (
                <div className="mt-3 overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Ref</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Item</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500">Amount</th>
                        {includeCommission && (
                          <th className="px-3 py-2 text-right font-semibold text-gray-500">Commission</th>
                        )}
                        {includeCommission && (
                          <th className="px-3 py-2 text-right font-semibold text-gray-500">Net Seller</th>
                        )}
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Buyer</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredOrders.slice(0, 5).map(order => {
                        const commBreakdown = calculateCommission(order.amount || 0);
                        const commission = order.commission_amount ?? commBreakdown.commissionAmount;
                        const netSeller = order.net_seller_amount ?? commBreakdown.netSellerAmount;
                        return (
                          <tr key={order.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-gray-700">
                              #{order.id.slice(0, 8).toUpperCase()}
                            </td>
                            <td className="px-3 py-2 text-gray-700 max-w-[100px] truncate">
                              {order.listing_title || 'Item'}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">
                              {formatZAR(order.amount || 0)}
                            </td>
                            {includeCommission && (
                              <td className="px-3 py-2 text-right text-red-600 font-medium">
                                {formatZAR(commission)}
                              </td>
                            )}
                            {includeCommission && (
                              <td className="px-3 py-2 text-right text-emerald-600 font-medium">
                                {formatZAR(netSeller)}
                              </td>
                            )}
                            <td className="px-3 py-2">
                              <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                                order.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                                order.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                                order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {order.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500 text-[10px]">
                              {maskName(order.buyer_name)}
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {formatExportDate(order.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredOrders.length > 5 && (
                    <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 text-center border-t border-gray-100">
                      ...and {filteredOrders.length - 5} more order{filteredOrders.length - 5 !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Columns included info */}
          <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-1.5">
              <FileText className="w-3.5 h-3.5 inline mr-1" />
              CSV columns included:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {['Order Reference', 'Listing Title', 'Amount'].map(col => (
                <span key={col} className="px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full">{col}</span>
              ))}
              {includeFees && ['Service Fee', 'Total'].map(col => (
                <span key={col} className="px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full">{col}</span>
              ))}
              {includeCommission && ['Commission', 'Commission Rate', 'Net Seller Amount'].map(col => (
                <span key={col} className="px-2 py-0.5 text-[10px] font-medium bg-indigo-100 text-indigo-700 rounded-full">{col}</span>
              ))}
              {['Status', 'Buyer (Masked)', 'Seller (Masked)', 'Type', 'Created Date', 'Updated Date'].map(col => (
                <span key={col} className="px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full">{col}</span>
              ))}
              {includeTracking && ['Tracking Number', 'Courier', 'Tracking Status'].map(col => (
                <span key={col} className="px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full">{col}</span>
              ))}
            </div>
          </div>

          {/* Empty State */}
          {filteredOrders.length === 0 && (
            <div className="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <AlertTriangle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700">No orders match your filters</p>
              <p className="text-xs text-gray-500 mt-1">Try adjusting the date range or export type</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center justify-between">
          <p className="text-xs text-gray-400">
            <FileText className="w-3.5 h-3.5 inline mr-1" />
            CSV format, UTF-8 encoded (Excel compatible)
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
              disabled={filteredOrders.length === 0 || exporting}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${
                exported
                  ? 'bg-emerald-600 text-white shadow-emerald-200'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
              }`}
            >
              {exporting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Exporting...</>
              ) : exported ? (
                <><CheckCircle2 className="w-4 h-4" /> Downloaded!</>
              ) : (
                <><Download className="w-4 h-4" /> Export CSV ({stats.total})</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportOrdersModal;
