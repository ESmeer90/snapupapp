import React, { useState, useEffect } from 'react';
import { updateListing, formatZAR, getCategories } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Listing, Category, ListingCondition, ListingStatus } from '@/types';

import { CONDITION_LABELS, SA_PROVINCES } from '@/types';
import { X, Save, Loader2, Tag, MapPin, FileText, DollarSign, Package, AlertTriangle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface EditListingModalProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updated: Listing) => void;
}

const EditListingModal: React.FC<EditListingModalProps> = ({ listing, isOpen, onClose, onUpdated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<ListingCondition>('good');
  const [location, setLocation] = useState('');
  const [province, setProvince] = useState('');
  const [status, setStatus] = useState<ListingStatus>('active');
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (listing) {
      setTitle(listing.title);
      setDescription(listing.description);
      setPrice(listing.price.toString());
      setCondition(listing.condition);
      setLocation(listing.location);
      setProvince(listing.province);
      setStatus(listing.status);
      setIsNegotiable(listing.is_negotiable);
      setCategoryId(listing.category_id);
    }
  }, [listing]);

  if (!isOpen || !listing) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !price || !location.trim()) {
      toast({ title: 'Validation Error', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const newPrice = parseFloat(price);
      const oldPrice = listing.price;
      const updated = await updateListing(listing.id, {
        title: title.trim(),
        description: description.trim(),
        price: newPrice,
        condition,
        location: location.trim(),
        province: province as any,
        status,
        is_negotiable: isNegotiable,
        category_id: categoryId,
      });

      // If price decreased, trigger price alert checks
      if (newPrice < oldPrice) {
        supabase.functions.invoke('check-price-alerts', {
          body: { action: 'check-listing', listing_id: listing.id, new_price: newPrice },
        }).then(({ data }) => {
          if (data?.notified && data.notified > 0) {
            toast({ title: 'Price alerts triggered', description: `${data.notified} buyer(s) have been notified of your price drop.` });
          }
        }).catch(() => {}); // Fire and forget
      }

      toast({ title: 'Listing updated', description: 'Your listing has been updated successfully.' });
      onUpdated({ ...listing, ...updated });
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update listing', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>

      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Edit Listing</h2>
            <p className="text-sm text-gray-500 mt-0.5">Update your listing details</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <FileText className="w-4 h-4 inline mr-1.5 text-gray-400" />
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              placeholder="What are you selling?"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
              placeholder="Describe your item in detail..."
            />
          </div>

          {/* Price & Condition Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                <DollarSign className="w-4 h-4 inline mr-1.5 text-gray-400" />
                Price (ZAR) *
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                placeholder="0"
                min="1"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                <Tag className="w-4 h-4 inline mr-1.5 text-gray-400" />
                Condition
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ListingCondition)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
              >
                {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label>
            <select
              value={categoryId || ''}
              onChange={(e) => setCategoryId(e.target.value || null)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
            >
              <option value="">Select category...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Location & Province */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                <MapPin className="w-4 h-4 inline mr-1.5 text-gray-400" />
                Location *
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                placeholder="e.g. Kimberley"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Province</label>
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
              >
                {SA_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <Package className="w-4 h-4 inline mr-1.5 text-gray-400" />
              Status
            </label>
            <div className="flex gap-2">
              {(['active', 'sold', 'archived'] as ListingStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    status === s
                      ? s === 'active' ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : s === 'sold' ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-500 bg-gray-50 text-gray-700'
                      : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Negotiable */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className={`w-11 h-6 rounded-full transition-all relative ${isNegotiable ? 'bg-blue-600' : 'bg-gray-300'}`}
              onClick={() => setIsNegotiable(!isNegotiable)}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${isNegotiable ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
            </div>
            <span className="text-sm font-medium text-gray-700">Price is negotiable</span>
          </label>

          {/* Warning for status change */}
          {status === 'sold' && listing.status !== 'sold' && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Marking as "Sold" will remove this listing from search results. Buyers will no longer be able to purchase it.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditListingModal;
