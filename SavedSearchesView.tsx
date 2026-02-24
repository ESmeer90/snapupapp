import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSavedSearches, createSavedSearch, updateSavedSearch, deleteSavedSearch,
  formatZAR, type SavedSearch
} from '@/lib/api';
import { CONDITION_LABELS } from '@/types';
import {
  Search, Bell, BellOff, Trash2, Edit3, Plus, Loader2, X, Save, Clock,
  MapPin, Tag, Filter, AlertTriangle, CheckCircle2, Mail, MailX, RefreshCw,
  Bookmark, ChevronRight, Eye, Zap
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface SavedSearchesViewProps {
  onApplySearch?: (params: { query?: string; category?: string; province?: string; minPrice?: string; maxPrice?: string; condition?: string }) => void;
  currentFilters?: {
    searchQuery?: string;
    selectedCategory?: string | null;
    selectedProvince?: string;
    minPrice?: string;
    maxPrice?: string;
    selectedCondition?: string;
    categoryName?: string;
  };
}

const SavedSearchesView: React.FC<SavedSearchesViewProps> = ({ onApplySearch, currentFilters }) => {
  const { user } = useAuth();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmailAlerts, setNewEmailAlerts] = useState(true);
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmailAlerts, setEditEmailAlerts] = useState(true);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSearches = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getSavedSearches();
      setSearches(data);
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to load saved searches', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadSearches(); }, [loadSearches]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast({ title: 'Error', description: 'Please enter a name for this search', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      await createSavedSearch({
        name: newName.trim(),
        category_id: currentFilters?.selectedCategory || null,
        category_name: currentFilters?.categoryName || null,
        province: currentFilters?.selectedProvince || null,
        min_price: currentFilters?.minPrice ? Number(currentFilters.minPrice) : null,
        max_price: currentFilters?.maxPrice ? Number(currentFilters.maxPrice) : null,
        keywords: currentFilters?.searchQuery || null,
        condition: currentFilters?.selectedCondition || null,
        email_alerts: newEmailAlerts,
      });
      toast({ title: 'Search saved!', description: 'You\'ll be notified when new listings match.' });
      setShowCreateModal(false);
      setNewName('');
      loadSearches();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save search', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAlerts = async (search: SavedSearch) => {
    try {
      await updateSavedSearch(search.id, { email_alerts: !search.email_alerts });
      setSearches(prev => prev.map(s => s.id === search.id ? { ...s, email_alerts: !s.email_alerts } : s));
      toast({ title: search.email_alerts ? 'Alerts disabled' : 'Alerts enabled' });
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to update alerts', variant: 'destructive' });
    }
  };

  const handleEdit = async () => {
    if (!editingSearch || !editName.trim()) return;
    setSaving(true);
    try {
      await updateSavedSearch(editingSearch.id, { name: editName.trim(), email_alerts: editEmailAlerts });
      setSearches(prev => prev.map(s => s.id === editingSearch.id ? { ...s, name: editName.trim(), email_alerts: editEmailAlerts } : s));
      toast({ title: 'Search updated' });
      setEditingSearch(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedSearch(id);
      setSearches(prev => prev.filter(s => s.id !== id));
      toast({ title: 'Search deleted' });
      setDeletingId(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to delete', variant: 'destructive' });
    }
  };

  const buildFilterTags = (search: SavedSearch) => {
    const tags: { label: string; color: string }[] = [];
    if (search.keywords) tags.push({ label: `"${search.keywords}"`, color: 'bg-blue-50 text-blue-700' });
    if (search.category_name) tags.push({ label: search.category_name, color: 'bg-purple-50 text-purple-700' });
    if (search.province) tags.push({ label: search.province, color: 'bg-emerald-50 text-emerald-700' });
    if (search.min_price || search.max_price) {
      const min = search.min_price ? formatZAR(Number(search.min_price)) : 'R0';
      const max = search.max_price ? formatZAR(Number(search.max_price)) : 'Any';
      tags.push({ label: `${min} - ${max}`, color: 'bg-amber-50 text-amber-700' });
    }
    if (search.condition) tags.push({ label: CONDITION_LABELS[search.condition as keyof typeof CONDITION_LABELS] || search.condition, color: 'bg-gray-100 text-gray-700' });
    return tags;
  };

  const alertsOnCount = searches.filter(s => s.email_alerts).length;
  const recentMatchCount = searches.reduce((sum, s) => sum + (s.last_match_count || 0), 0);

  const hasCurrentFilters = currentFilters && (
    currentFilters.searchQuery || currentFilters.selectedCategory || currentFilters.minPrice ||
    currentFilters.maxPrice || currentFilters.selectedCondition
  );

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Saved Searches</h2>
          <p className="text-sm text-gray-500 mt-1">
            {loading ? 'Loading...' : `${searches.length} saved search${searches.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadSearches} className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-200" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          {hasCurrentFilters && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-200"
            >
              <Plus className="w-4 h-4" /> Save Current Search
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {!loading && searches.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
            <Bookmark className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-900">{searches.length}</p>
            <p className="text-xs text-gray-500">Saved Searches</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
            <Bell className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-900">{alertsOnCount}</p>
            <p className="text-xs text-gray-500">Alerts Active</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
            <Zap className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-900">{recentMatchCount}</p>
            <p className="text-xs text-gray-500">Recent Matches</p>
          </div>
        </div>
      )}

      {/* Save Current Search Prompt */}
      {!loading && hasCurrentFilters && searches.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-blue-800">Save your current search?</p>
              <p className="text-xs text-blue-600">Get notified when new listings match your filters</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-all"
          >
            Save
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : searches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-10 h-10 text-blue-300" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No saved searches yet</h3>
          <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
            Browse listings with filters, then save your search to get email notifications when new matching listings are posted.
          </p>
          {hasCurrentFilters ? (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <Plus className="w-4 h-4" /> Save Current Search
            </button>
          ) : (
            <p className="text-xs text-gray-400">Apply some filters on the Browse page first, then come back to save them.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {searches.map(search => {
            const tags = buildFilterTags(search);
            const isDeleting = deletingId === search.id;
            return (
              <div key={search.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{search.name}</h3>
                      {search.email_alerts ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-medium rounded-full border border-emerald-200">
                          <Bell className="w-2.5 h-2.5" /> Alerts On
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 text-[10px] font-medium rounded-full border border-gray-200">
                          <BellOff className="w-2.5 h-2.5" /> Alerts Off
                        </span>
                      )}
                    </div>

                    {/* Filter Tags */}
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {tags.map((tag, i) => (
                          <span key={i} className={`px-2 py-0.5 text-xs font-medium rounded-full ${tag.color}`}>
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">No specific filters (all listings)</p>
                    )}

                    {/* Meta info */}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      {search.last_match_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {search.last_match_count} recent matches
                        </span>
                      )}
                      {search.last_notified_at && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> Last notified: {new Date(search.last_notified_at).toLocaleDateString('en-ZA')}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Created: {new Date(search.created_at).toLocaleDateString('en-ZA')}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggleAlerts(search)}
                      className={`p-2 rounded-lg transition-all ${search.email_alerts ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-50'}`}
                      title={search.email_alerts ? 'Disable alerts' : 'Enable alerts'}
                    >
                      {search.email_alerts ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { setEditingSearch(search); setEditName(search.name); setEditEmailAlerts(search.email_alerts); }}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {isDeleting ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(search.id)}
                          className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-all"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(search.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Apply Search Button */}
                {onApplySearch && (
                  <button
                    onClick={() => onApplySearch({
                      query: search.keywords || undefined,
                      category: search.category_id || undefined,
                      province: search.province || undefined,
                      minPrice: search.min_price ? String(search.min_price) : undefined,
                      maxPrice: search.max_price ? String(search.max_price) : undefined,
                      condition: search.condition || undefined,
                    })}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-all"
                  >
                    <Search className="w-3.5 h-3.5" /> Run This Search
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Bookmark className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Save Search</h3>
                  <p className="text-xs text-gray-500">Get notified when new listings match</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Search Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g., iPhone deals in Gauteng"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  maxLength={100}
                  autoFocus
                />
              </div>

              {/* Current Filters Preview */}
              {currentFilters && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Filters to save</label>
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1.5">
                    {currentFilters.searchQuery && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Search className="w-3 h-3 text-gray-400" /> Keywords: "{currentFilters.searchQuery}"
                      </div>
                    )}
                    {currentFilters.categoryName && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Tag className="w-3 h-3 text-gray-400" /> Category: {currentFilters.categoryName}
                      </div>
                    )}
                    {currentFilters.selectedProvince && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <MapPin className="w-3 h-3 text-gray-400" /> Province: {currentFilters.selectedProvince}
                      </div>
                    )}
                    {(currentFilters.minPrice || currentFilters.maxPrice) && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Filter className="w-3 h-3 text-gray-400" /> Price: {currentFilters.minPrice ? formatZAR(Number(currentFilters.minPrice)) : 'R0'} - {currentFilters.maxPrice ? formatZAR(Number(currentFilters.maxPrice)) : 'Any'}
                      </div>
                    )}
                    {currentFilters.selectedCondition && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <CheckCircle2 className="w-3 h-3 text-gray-400" /> Condition: {CONDITION_LABELS[currentFilters.selectedCondition as keyof typeof CONDITION_LABELS] || currentFilters.selectedCondition}
                      </div>
                    )}
                    {!currentFilters.searchQuery && !currentFilters.categoryName && !currentFilters.minPrice && !currentFilters.maxPrice && !currentFilters.selectedCondition && (
                      <p className="text-xs text-gray-400">No specific filters applied</p>
                    )}
                  </div>
                </div>
              )}

              {/* Email Alerts Toggle */}
              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Email notifications</p>
                    <p className="text-xs text-gray-500">Get emailed when new listings match</p>
                  </div>
                </div>
                <div className={`relative w-11 h-6 rounded-full transition-colors ${newEmailAlerts ? 'bg-blue-600' : 'bg-gray-300'}`} onClick={() => setNewEmailAlerts(!newEmailAlerts)}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${newEmailAlerts ? 'translate-x-5.5 left-[1px]' : 'left-0.5'}`} style={{ transform: newEmailAlerts ? 'translateX(22px)' : 'translateX(0)' }} />
                </div>
              </label>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setShowCreateModal(false); setNewName(''); }}
                className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditingSearch(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Edit Saved Search</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Search Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  maxLength={100}
                />
              </div>
              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Email notifications</p>
                    <p className="text-xs text-gray-500">Get emailed when new listings match</p>
                  </div>
                </div>
                <div className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${editEmailAlerts ? 'bg-blue-600' : 'bg-gray-300'}`} onClick={() => setEditEmailAlerts(!editEmailAlerts)}>
                  <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" style={{ transform: editEmailAlerts ? 'translateX(22px)' : 'translateX(2px)' }} />
                </div>
              </label>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button onClick={() => setEditingSearch(null)} className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all">
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={!editName.trim() || saving}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default SavedSearchesView;
