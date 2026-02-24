import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserListings, deleteListing, updateListing, createListing, getCategories, formatZAR, timeAgo } from '@/lib/api';
import type { Listing, Category } from '@/types';
import { CONDITION_LABELS } from '@/types';
import {
  Plus, Trash2, Eye, MapPin, Clock, Package, Loader2, RefreshCw, AlertTriangle,
  CheckSquare, Square, Pause, Play, X, ShoppingBag, Copy, Percent, DollarSign,
  ChevronDown, Tag, FileSpreadsheet, Upload
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import BulkCSVImport from './BulkCSVImport';


interface MyListingsProps {
  onOpenCreateListing: () => void;
  refreshTrigger: number;
}

type BulkActionType = 'delete' | 'sold' | 'archive' | 'activate' | 'price' | 'duplicate' | null;

const MyListings: React.FC<MyListingsProps> = ({ onOpenCreateListing, refreshTrigger }) => {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [csvCategories, setCsvCategories] = useState<Category[]>([]);

  // Bulk action state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [showBulkMenu, setShowBulkMenu] = useState(false);

  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; action: BulkActionType; title: string; description: string }>({
    open: false, action: null, title: '', description: ''
  });

  // Price change modal
  const [priceModal, setPriceModal] = useState(false);
  const [priceChangeType, setPriceChangeType] = useState<'increase' | 'decrease'>('decrease');
  const [priceChangePercent, setPriceChangePercent] = useState('10');

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (user) loadListings();
  }, [user, refreshTrigger]);

  const loadListings = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUserListings(user.id);
      setListings(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load your listings');
      toast({ title: 'Error', description: 'Failed to load your listings', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this listing? This action cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteListing(id);
      setListings((prev) => prev.filter((l) => l.id !== id));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      toast({ title: 'Listing deleted', description: 'Your listing has been removed.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to delete listing', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  // Bulk selection
  const filteredListings = statusFilter === 'all' ? listings : listings.filter(l => l.status === statusFilter);
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredListings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredListings.map(l => l.id)));
    }
  };

  const clearSelection = () => { setSelectedIds(new Set()); setShowBulkMenu(false); };

  // Bulk action helpers
  const runBulkAction = async (action: BulkActionType) => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    setBulkProgress({ current: 0, total: selectedIds.size });
    let success = 0;
    let failed = 0;
    const ids = Array.from(selectedIds);

    for (let i = 0; i < ids.length; i++) {
      setBulkProgress({ current: i + 1, total: ids.length });
      const id = ids[i];
      const listing = listings.find(l => l.id === id);
      if (!listing) continue;

      try {
        switch (action) {
          case 'delete':
            await deleteListing(id);
            break;
          case 'sold':
            await updateListing(id, { status: 'sold' });
            break;
          case 'archive':
            if (listing.status === 'active') await updateListing(id, { status: 'archived' });
            break;
          case 'activate':
            if (listing.status === 'archived') await updateListing(id, { status: 'active' });
            break;
          case 'price': {
            const pct = parseFloat(priceChangePercent) / 100;
            const newPrice = priceChangeType === 'increase'
              ? Math.round(listing.price * (1 + pct))
              : Math.round(listing.price * (1 - pct));
            if (newPrice > 0) await updateListing(id, { price: newPrice });
            break;
          }
          case 'duplicate': {
            if (!user) break;
            await createListing({
              title: `${listing.title} (Copy)`,
              description: listing.description,
              price: listing.price,
              category_id: listing.category_id,
              condition: listing.condition,
              location: listing.location,
              province: listing.province,
              images: listing.images || [],
              is_negotiable: listing.is_negotiable,
              user_id: user.id,
            });
            break;
          }
        }
        success++;
      } catch {
        failed++;
      }
    }

    setSelectedIds(new Set());
    setBulkProcessing(false);
    setBulkProgress({ current: 0, total: 0 });
    setConfirmModal({ open: false, action: null, title: '', description: '' });
    setPriceModal(false);

    const actionLabel = action === 'delete' ? 'deleted' : action === 'sold' ? 'marked as sold' : action === 'archive' ? 'archived' : action === 'activate' ? 'activated' : action === 'price' ? 'price updated' : 'duplicated';
    if (failed > 0) {
      toast({ title: 'Partial Success', description: `${success} ${actionLabel}, ${failed} failed.`, variant: 'destructive' });
    } else {
      toast({ title: 'Bulk Action Complete', description: `${success} listing(s) ${actionLabel}.` });
    }
    loadListings();
  };

  const openConfirmModal = (action: BulkActionType, title: string, description: string) => {
    setShowBulkMenu(false);
    if (action === 'price') {
      setPriceModal(true);
    } else {
      setConfirmModal({ open: true, action, title, description });
    }
  };

  const PLACEHOLDER = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=150&fit=crop';
  const hasSelection = selectedIds.size > 0;

  const statusCounts = {
    all: listings.length,
    active: listings.filter(l => l.status === 'active').length,
    sold: listings.filter(l => l.status === 'sold').length,
    archived: listings.filter(l => l.status === 'archived').length,
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Listings</h2>
          <p className="text-gray-500 text-sm mt-1">
            {loading ? 'Loading...' : `${listings.length} listing${listings.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <button onClick={loadListings} className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-200" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={async () => {
              if (csvCategories.length === 0) {
                try { const cats = await getCategories(); setCsvCategories(cats); } catch {}
              }
              setShowCSVImport(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" /> <span className="hidden sm:inline">CSV Import</span>
          </button>
          <a href="/post-item" className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-200">
            <Plus className="w-4 h-4" /> New Listing
          </a>
        </div>

      </div>

      {/* Status Filter Tabs */}
      {!loading && listings.length > 0 && (
        <div className="flex items-center gap-1 mb-4 bg-white rounded-xl border border-gray-200 p-1 shadow-sm overflow-x-auto">
          {[
            { id: 'all', label: 'All', count: statusCounts.all },
            { id: 'active', label: 'Active', count: statusCounts.active },
            { id: 'sold', label: 'Sold', count: statusCounts.sold },
            { id: 'archived', label: 'Archived', count: statusCounts.archived },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setStatusFilter(tab.id); setSelectedIds(new Set()); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                statusFilter === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Bulk Actions Bar */}
      {hasSelection && !loading && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-2xl animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <CheckSquare className="w-4 h-4" />
            {selectedIds.size} selected
          </div>

          {/* Progress indicator */}
          {bulkProcessing && (
            <div className="flex items-center gap-2 ml-2">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              <div className="w-24 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-blue-600">{bulkProgress.current}/{bulkProgress.total}</span>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              onClick={() => openConfirmModal('sold', 'Mark as Sold', `Mark ${selectedIds.size} listing(s) as sold?`)}
              disabled={bulkProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-all disabled:opacity-50"
            >
              <ShoppingBag className="w-3 h-3" /> Mark Sold
            </button>
            <button
              onClick={() => openConfirmModal('archive', 'Archive Listings', `Archive ${selectedIds.size} listing(s)?`)}
              disabled={bulkProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-all disabled:opacity-50"
            >
              <Pause className="w-3 h-3" /> Archive
            </button>
            <button
              onClick={() => openConfirmModal('activate', 'Activate Listings', `Activate ${selectedIds.size} listing(s)?`)}
              disabled={bulkProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-all disabled:opacity-50"
            >
              <Play className="w-3 h-3" /> Activate
            </button>
            <button
              onClick={() => openConfirmModal('price', 'Change Price', '')}
              disabled={bulkProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-all disabled:opacity-50"
            >
              <Percent className="w-3 h-3" /> Change Price
            </button>
            <button
              onClick={() => openConfirmModal('duplicate', 'Duplicate Listings', `Duplicate ${selectedIds.size} listing(s)? New copies will be created as active listings.`)}
              disabled={bulkProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-700 bg-cyan-100 hover:bg-cyan-200 rounded-lg transition-all disabled:opacity-50"
            >
              <Copy className="w-3 h-3" /> Duplicate
            </button>
            <button
              onClick={() => openConfirmModal('delete', 'Delete Listings', `Permanently delete ${selectedIds.size} listing(s)? This cannot be undone.`)}
              disabled={bulkProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
            <button onClick={clearSelection} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading your listings...</p>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-20 bg-red-50 rounded-2xl border-2 border-dashed border-red-200">
          <AlertTriangle className="w-16 h-16 text-red-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Failed to load listings</h3>
          <p className="text-gray-500 mb-4">{error}</p>
          <button onClick={loadListings} className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      )}

      {!loading && !error && listings.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">No listings yet</h3>
          <p className="text-gray-500 mb-6">Start selling by creating your first listing!</p>
          <a href="/post-item" className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
            <Plus className="w-4 h-4" /> Create Your First Listing
          </a>
        </div>
      )}

      {!loading && !error && filteredListings.length > 0 && (
        <div className="space-y-3">
          {/* Select All */}
          <div className="flex items-center gap-3 px-2">
            <button onClick={selectAll} className="flex items-center gap-2 text-xs text-gray-500 hover:text-blue-600 transition-all">
              {selectedIds.size === filteredListings.length && filteredListings.length > 0 ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
              {selectedIds.size === filteredListings.length && filteredListings.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-xs text-gray-400">
              Showing {filteredListings.length} {statusFilter !== 'all' ? statusFilter : ''} listing{filteredListings.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filteredListings.map((listing) => (
            <div
              key={listing.id}
              className={`bg-white rounded-2xl border p-4 flex gap-4 hover:shadow-md transition-all ${
                selectedIds.has(listing.id) ? 'border-blue-300 bg-blue-50/30 ring-1 ring-blue-200' : 'border-gray-200'
              }`}
            >
              {/* Checkbox */}
              <button onClick={() => toggleSelect(listing.id)} className="flex-shrink-0 mt-1">
                {selectedIds.has(listing.id) ? (
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                ) : (
                  <Square className="w-5 h-5 text-gray-300 hover:text-gray-500" />
                )}
              </button>

              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                <img
                  src={listing.images?.[0] || PLACEHOLDER}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 truncate">{listing.title}</h3>
                    <p className="text-xl font-black text-blue-600">{formatZAR(listing.price)}</p>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full flex-shrink-0 ${
                    listing.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                    listing.status === 'sold' ? 'bg-blue-100 text-blue-700' :
                    listing.status === 'archived' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {listing.status === 'archived' ? 'Archived' : listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{listing.location}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(listing.created_at)}</span>
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{listing.view_count} views</span>
                  {listing.category_name && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">{listing.category_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => handleDelete(listing.id)}
                    disabled={deletingId === listing.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all disabled:opacity-50"
                  >
                    {deletingId === listing.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Delete
                  </button>
                  {listing.status === 'active' && (
                    <>
                      <button
                        onClick={async () => {
                          try {
                            await updateListing(listing.id, { status: 'sold' });
                            setListings(prev => prev.map(l => l.id === listing.id ? { ...l, status: 'sold' } : l));
                            toast({ title: 'Marked as sold' });
                          } catch { toast({ title: 'Error', variant: 'destructive' }); }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
                      >
                        <ShoppingBag className="w-3 h-3" /> Mark Sold
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await updateListing(listing.id, { status: 'archived' });
                            setListings(prev => prev.map(l => l.id === listing.id ? { ...l, status: 'archived' } : l));
                            toast({ title: 'Listing archived' });
                          } catch { toast({ title: 'Error', variant: 'destructive' }); }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-all"
                      >
                        <Pause className="w-3 h-3" /> Archive
                      </button>
                    </>
                  )}
                  {listing.status === 'archived' && (
                    <button
                      onClick={async () => {
                        try {
                          await updateListing(listing.id, { status: 'active' });
                          setListings(prev => prev.map(l => l.id === listing.id ? { ...l, status: 'active' } : l));
                          toast({ title: 'Listing activated' });
                        } catch { toast({ title: 'Error', variant: 'destructive' }); }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-all"
                    >
                      <Play className="w-3 h-3" /> Activate
                    </button>
                  )}
                  {user && (
                    <button
                      onClick={async () => {
                        try {
                          await createListing({
                            title: `${listing.title} (Copy)`,
                            description: listing.description,
                            price: listing.price,
                            category_id: listing.category_id,
                            condition: listing.condition,
                            location: listing.location,
                            province: listing.province,
                            images: listing.images || [],
                            is_negotiable: listing.is_negotiable,
                            user_id: user.id,
                          });
                          toast({ title: 'Listing duplicated' });
                          loadListings();
                        } catch { toast({ title: 'Error', description: 'Failed to duplicate', variant: 'destructive' }); }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-all"
                    >
                      <Copy className="w-3 h-3" /> Duplicate
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !bulkProcessing && setConfirmModal({ open: false, action: null, title: '', description: '' })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">{confirmModal.title}</h3>
              <p className="text-sm text-gray-500 text-center">{confirmModal.description}</p>

              {bulkProcessing && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Processing...</span>
                    <span>{bulkProgress.current}/{bulkProgress.total}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setConfirmModal({ open: false, action: null, title: '', description: '' })}
                disabled={bulkProcessing}
                className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => runBulkAction(confirmModal.action)}
                disabled={bulkProcessing}
                className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                  confirmModal.action === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {bulkProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {bulkProcessing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price Change Modal */}
      {priceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !bulkProcessing && setPriceModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                  <Percent className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Change Price</h3>
                  <p className="text-xs text-gray-500">Adjust price for {selectedIds.size} listing(s)</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setPriceChangeType('decrease')}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all ${priceChangeType === 'decrease' ? 'bg-red-100 text-red-700 border-2 border-red-300' : 'bg-gray-50 text-gray-600 border-2 border-transparent'}`}
                >
                  Decrease
                </button>
                <button
                  onClick={() => setPriceChangeType('increase')}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all ${priceChangeType === 'increase' ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-300' : 'bg-gray-50 text-gray-600 border-2 border-transparent'}`}
                >
                  Increase
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Percentage (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={priceChangePercent}
                    onChange={e => setPriceChangePercent(e.target.value)}
                    min="1"
                    max="90"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm pr-10"
                  />
                  <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
              <div className="flex gap-2">
                {[5, 10, 15, 20, 25].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setPriceChangePercent(String(pct))}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${priceChangePercent === String(pct) ? 'bg-purple-100 text-purple-700 border border-purple-300' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs text-gray-500">
                  This will {priceChangeType} all selected listing prices by <strong>{priceChangePercent}%</strong>.
                  {priceChangeType === 'decrease' && ' Prices will be rounded down.'}
                  {priceChangeType === 'increase' && ' Prices will be rounded up.'}
                </p>
              </div>

              {bulkProcessing && (
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Updating prices...</span>
                    <span>{bulkProgress.current}/{bulkProgress.total}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-600 rounded-full transition-all duration-300" style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setPriceModal(false)}
                disabled={bulkProcessing}
                className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => runBulkAction('price')}
                disabled={bulkProcessing || !priceChangePercent || parseFloat(priceChangePercent) <= 0}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {bulkProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                {bulkProcessing ? 'Updating...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {showCSVImport && (
        <BulkCSVImport
          categories={csvCategories}
          onClose={() => setShowCSVImport(false)}
          onImportComplete={() => loadListings()}
        />
      )}
    </section>
  );
};

export default MyListings;
