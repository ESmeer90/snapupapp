import React, { useState, useMemo } from 'react';
import type { SellerOrder } from '@/types';
import { calculateCommission } from '@/lib/commission';
import {
  downloadCSV,
  filterByDateRange,
  formatExportDateTime,
  formatExportZAR,
  generateFilename,
} from '@/lib/export';
import {
  Download, Calendar, Loader2, CheckCircle2, ChevronDown, X, FileSpreadsheet, Shield
} from 'lucide-react';

interface SellerOrdersCSVExportProps {
  orders: SellerOrder[];
  /** Render as inline button (compact) or full dropdown panel */
  variant?: 'button' | 'panel';
}

const SellerOrdersCSVExport: React.FC<SellerOrdersCSVExportProps> = ({ orders, variant = 'button' }) => {
  const [showPanel, setShowPanel] = useState(false);
  const [datePreset, setDatePreset] = useState<string>('all');
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  // Calculate date range from preset
  const dateRange = useMemo(() => {
    const now = new Date();
    let startDate: string | null = null;
    const endDate = now.toISOString().slice(0, 10);

    switch (datePreset) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
        break;
      case 'all':
      default:
        return { startDate: null, endDate: null };
    }
    return { startDate, endDate };
  }, [datePreset]);

  // Filter orders by date range
  const filteredOrders = useMemo(() => {
    return filterByDateRange(orders, 'created_at', dateRange.startDate, dateRange.endDate);
  }, [orders, dateRange]);

  const handleExport = () => {
    if (filteredOrders.length === 0) return;
    setExporting(true);

    const headers = [
      { key: 'order_ref', label: 'Order Reference' },
      { key: 'listing_title', label: 'Listing Title' },
      { key: 'amount', label: 'Amount (ZAR)' },
      { key: 'service_fee', label: 'Service Fee (ZAR)' },
      { key: 'total', label: 'Total (ZAR)' },
      { key: 'commission', label: 'Commission (ZAR)' },
      { key: 'commission_rate', label: 'Commission Rate' },
      { key: 'net_seller_amount', label: 'Net Seller Amount (ZAR)' },
      { key: 'status', label: 'Status' },
      { key: 'tracking_number', label: 'Tracking Number' },
      { key: 'courier', label: 'Courier' },
      { key: 'tracking_status', label: 'Tracking Status' },
      { key: 'buyer_name', label: 'Buyer (Masked)' },
      { key: 'seller_name', label: 'Seller' },
      { key: 'created_at', label: 'Created Date' },
      { key: 'updated_at', label: 'Updated Date' },
    ];

    const rows = filteredOrders.map(order => {
      const commBreakdown = calculateCommission(order.amount || 0);
      return {
        order_ref: `#${order.id.slice(0, 8).toUpperCase()}`,
        listing_title: order.listing_title || 'Item',
        amount: formatExportZAR(order.amount || 0),
        service_fee: formatExportZAR(order.service_fee || 0),
        total: formatExportZAR(order.total || 0),
        commission: formatExportZAR(commBreakdown.commissionAmount),
        commission_rate: `${Math.round(commBreakdown.commissionRate * 100)}%`,
        net_seller_amount: formatExportZAR(commBreakdown.netSellerAmount),
        status: (order.status || 'unknown').charAt(0).toUpperCase() + (order.status || 'unknown').slice(1),
        tracking_number: order.tracking_number || '',
        courier: order.carrier || '',
        tracking_status: order.tracking_status || '',
        buyer_name: order.buyer_name_masked || 'Buyer',
        seller_name: 'You (Seller)',
        created_at: formatExportDateTime(order.created_at),
        updated_at: formatExportDateTime(order.updated_at),
      };
    });

    const filename = generateFilename('snapup_seller_orders');

    setTimeout(() => {
      downloadCSV(headers, rows, filename);
      setExporting(false);
      setExported(true);
      setTimeout(() => {
        setExported(false);
        setShowPanel(false);
      }, 2000);
    }, 400);
  };

  // Quick export (no panel, just download with current preset)
  const handleQuickExport = () => {
    if (orders.length === 0) return;
    // Use all orders for quick export
    setDatePreset('all');
    setTimeout(() => handleExport(), 50);
  };

  if (variant === 'button' && !showPanel) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowPanel(true)}
          disabled={orders.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="Download orders as CSV"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Download CSV</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Trigger button (when panel is showing) */}
      {variant === 'button' && (
        <button
          onClick={() => setShowPanel(false)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-300 rounded-xl transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Download CSV</span>
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Dropdown panel */}
      {(showPanel || variant === 'panel') && (
        <div className={`${variant === 'button' ? 'absolute right-0 top-full mt-2 z-20' : ''} bg-white rounded-xl border border-gray-200 shadow-xl p-4 w-72`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <h4 className="text-sm font-semibold text-gray-900">Export Orders CSV</h4>
            </div>
            {variant === 'button' && (
              <button onClick={() => setShowPanel(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-all">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Date range presets */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              <Calendar className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
              Date Range
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Last 7 days', value: '7d' },
                { label: 'Last 30 days', value: '30d' },
                { label: 'Last 90 days', value: '90d' },
                { label: 'All time', value: 'all' },
              ].map(preset => (
                <button
                  key={preset.value}
                  onClick={() => setDatePreset(preset.value)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    datePreset === preset.value
                      ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Order count */}
          <div className="bg-gray-50 rounded-lg p-2.5 mb-3 text-center">
            <p className="text-lg font-bold text-gray-900">{filteredOrders.length}</p>
            <p className="text-[10px] text-gray-500">orders to export</p>
          </div>

          {/* POPIA notice */}
          <div className="flex items-start gap-1.5 p-2 bg-blue-50 border border-blue-100 rounded-lg mb-3">
            <Shield className="w-3 h-3 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-blue-600">
              Buyer names masked per POPIA. Includes commission breakdown.
            </p>
          </div>

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={filteredOrders.length === 0 || exporting}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              exported
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
            }`}
          >
            {exporting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Exporting...</>
            ) : exported ? (
              <><CheckCircle2 className="w-4 h-4" /> Downloaded!</>
            ) : (
              <><Download className="w-4 h-4" /> Download CSV ({filteredOrders.length})</>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default SellerOrdersCSVExport;
