import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createListing, uploadListingImage, createLocalPreview, revokeLocalPreview } from '@/lib/api';
import { SA_PROVINCES, CONDITION_LABELS, type SAProvince, type ListingCondition, type Category } from '@/types';
import { X, Loader2, MapPin, AlertTriangle, CheckCircle2, Info, Camera, RefreshCw, WifiOff } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import CommissionDisclosure from './CommissionDisclosure';

interface CreateListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onListingCreated: () => void;
}

interface ImageSlot {
  id: string;
  file: File;
  previewUrl: string;
  uploadedUrl: string | null;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
}

interface FormErrors {
  title?: string;
  price?: string;
  description?: string;
  location?: string;
  images?: string;
  category?: string;
}

const CreateListingModal: React.FC<CreateListingModalProps> = ({ isOpen, onClose, categories, onListingCreated }) => {
  const { user, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState<ListingCondition>('good');
  const [location, setLocation] = useState(profile?.province === 'Northern Cape' ? 'Kimberley' : '');
  const [province, setProvince] = useState<SAProvince>(profile?.province || 'Northern Cape');
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [commissionAgreed, setCommissionAgreed] = useState(false);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      imageSlots.forEach(slot => revokeLocalPreview(slot.previewUrl));
    };
  }, []);

  if (!isOpen || !user) return null;

  const validateField = (field: string, value: string): string | undefined => {
    switch (field) {
      case 'title':
        if (!value.trim()) return 'Title is required';
        if (value.trim().length < 3) return 'Title must be at least 3 characters';
        if (value.trim().length > 100) return 'Title must be under 100 characters';
        return undefined;
      case 'price':
        if (!value) return 'Price is required';
        const num = parseFloat(value);
        if (isNaN(num)) return 'Please enter a valid number';
        if (num <= 0) return 'Price must be greater than R0';
        if (num > 10000000) return 'Price seems too high. Maximum R10,000,000';
        return undefined;
      case 'description':
        if (value.length > 2000) return 'Description must be under 2000 characters';
        return undefined;
      case 'location':
        if (!value.trim()) return 'Location is required';
        if (value.trim().length < 2) return 'Please enter a valid location';
        return undefined;
      case 'category':
        if (!value) return 'Please select a category';
        return undefined;
      default:
        return undefined;
    }
  };

  const handleBlur = (field: string, value: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const error = validateField(field, value);
    setErrors(prev => ({ ...prev, [field]: error }));
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {
      title: validateField('title', title),
      price: validateField('price', price),
      description: validateField('description', description),
      location: validateField('location', location),
      category: validateField('category', categoryId),
    };
    setErrors(newErrors);
    setTouched({ title: true, price: true, description: true, location: true, category: true });
    return !Object.values(newErrors).some(Boolean);
  };

  const uploadSingleImage = async (slot: ImageSlot) => {
    setImageSlots(prev => prev.map(s => s.id === slot.id ? { ...s, status: 'uploading', errorMsg: undefined } : s));
    try {
      const url = await uploadListingImage(slot.file);
      setImageSlots(prev => prev.map(s => s.id === slot.id ? { ...s, status: 'done', uploadedUrl: url } : s));
    } catch (err: any) {
      setImageSlots(prev => prev.map(s => s.id === slot.id ? { ...s, status: 'error', errorMsg: err.message || 'Upload failed' } : s));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxSize = 10 * 1024 * 1024;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const validFiles: File[] = [];

    for (const file of Array.from(files)) {
      if (!validTypes.includes(file.type)) {
        toast({ title: 'Invalid file type', description: `${file.name} is not supported. Use JPEG, PNG, or WebP.`, variant: 'destructive' });
        continue;
      }
      if (file.size > maxSize) {
        toast({ title: 'File too large', description: `${file.name} is larger than 10MB.`, variant: 'destructive' });
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    const remaining = 5 - imageSlots.length;
    if (remaining <= 0) {
      toast({ title: 'Maximum photos reached', description: 'You can upload up to 5 photos per listing.', variant: 'destructive' });
      return;
    }

    const filesToAdd = validFiles.slice(0, remaining);
    const newSlots: ImageSlot[] = filesToAdd.map(file => ({
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      file,
      previewUrl: createLocalPreview(file),
      uploadedUrl: null,
      status: 'pending' as const,
    }));

    setImageSlots(prev => [...prev, ...newSlots]);
    setErrors(prev => ({ ...prev, images: undefined }));

    for (const slot of newSlots) {
      uploadSingleImage(slot);
    }

    e.target.value = '';
  };

  const removeImage = (slotId: string) => {
    setImageSlots(prev => {
      const slot = prev.find(s => s.id === slotId);
      if (slot) revokeLocalPreview(slot.previewUrl);
      return prev.filter(s => s.id !== slotId);
    });
  };

  const retryUpload = (slotId: string) => {
    const slot = imageSlots.find(s => s.id === slotId);
    if (slot) uploadSingleImage(slot);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!commissionAgreed) {
      toast({ title: 'Commission agreement required', description: 'Please agree to the commission terms before publishing.', variant: 'destructive' });
      return;
    }

    if (!validateForm()) {
      toast({ title: 'Please fix the errors', description: 'Some required fields have issues.', variant: 'destructive' });
      return;
    }

    const stillUploading = imageSlots.some(s => s.status === 'uploading' || s.status === 'pending');
    if (stillUploading) {
      toast({ title: 'Images still uploading', description: 'Please wait for uploads to complete.', variant: 'destructive' });
      return;
    }

    const uploadedUrls = imageSlots.filter(s => s.status === 'done' && s.uploadedUrl).map(s => s.uploadedUrl!);

    setSubmitting(true);
    try {
      await createListing({
        title: title.trim(),
        description: description.trim(),
        price: parseFloat(price),
        category_id: categoryId || null,
        condition,
        location: location.trim(),
        province,
        images: uploadedUrls,
        is_negotiable: isNegotiable,
        user_id: user.id,
      });
      toast({ title: 'Listing created!', description: 'Your item is now live on SnapUp.' });
      onListingCreated();
      onClose();
      setTitle(''); setDescription(''); setPrice(''); setCategoryId('');
      setCondition('good'); setImageSlots([]); setIsNegotiable(false);
      setLocation(profile?.province === 'Northern Cape' ? 'Kimberley' : '');
      setErrors({}); setTouched({});
    } catch (err: any) {
      toast({ title: 'Failed to create listing', description: err.message || 'Something went wrong.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const isAnyUploading = imageSlots.some(s => s.status === 'uploading' || s.status === 'pending');
  const failedUploads = imageSlots.filter(s => s.status === 'error');
  const hasErrors = Object.values(errors).some(Boolean);

  const completionPct = [
    title.trim().length >= 3,
    parseFloat(price) > 0,
    location.trim().length >= 2,
    description.trim().length > 0,
    imageSlots.length > 0,
    !!categoryId,
  ].filter(Boolean).length;
  const completionPercent = Math.round((completionPct / 6) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-4 sm:pt-8 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-4 sm:my-8" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-white">Create Listing</h2>
            <p className="text-sm text-blue-100">List your item for sale on SnapUp</p>
          </div>
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Completion Progress */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  completionPercent === 100 ? 'bg-emerald-500' : completionPercent >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                }`}
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-500">{completionPercent}%</span>
          </div>
          <p className="text-xs text-gray-400">
            {completionPercent === 100 ? (
              <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Ready to publish!</span>
            ) : 'Complete all fields for the best results'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Images */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Photos <span className="text-xs text-gray-400 font-normal">(max 5, recommended)</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {imageSlots.map((slot, i) => (
                <div key={slot.id} className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-gray-200 group">
                  <img 
                    src={slot.status === 'done' && slot.uploadedUrl ? slot.uploadedUrl : slot.previewUrl} 
                    alt="" 
                    className={`w-full h-full object-cover ${
                      slot.status === 'uploading' ? 'opacity-60' : slot.status === 'error' ? 'opacity-40 grayscale' : ''
                    }`} 
                  />
                  {(slot.status === 'uploading' || slot.status === 'pending') && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                  {slot.status === 'done' && (
                    <div className="absolute bottom-0.5 right-0.5">
                      <CheckCircle2 className="w-4 h-4 text-green-500 bg-white rounded-full" />
                    </div>
                  )}
                  {slot.status === 'error' && (
                    <div className="absolute inset-0 bg-red-900/40 flex flex-col items-center justify-center">
                      <WifiOff className="w-4 h-4 text-white mb-0.5" />
                      <button
                        type="button"
                        onClick={() => retryUpload(slot.id)}
                        className="px-1.5 py-0.5 bg-white text-red-600 text-[9px] font-bold rounded flex items-center gap-0.5"
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Retry
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(slot.id)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                  {i === 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-blue-600 text-white text-[10px] font-bold text-center py-0.5">Cover</div>
                  )}
                </div>
              ))}
              {imageSlots.length < 5 && (
                <label className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
                  <Camera className="w-5 h-5 text-gray-400" />
                  <span className="text-xs text-gray-400 mt-1">Add Photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            {isAnyUploading && (
              <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Compressing and uploading...
              </p>
            )}
            {failedUploads.length > 0 && (
              <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {failedUploads.length} upload(s) failed. Click retry on each image.
              </p>
            )}
            {imageSlots.length === 0 && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <Info className="w-3 h-3" /> Listings with photos get 5x more views
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input
              type="text" value={title}
              onChange={(e) => { setTitle(e.target.value); if (touched.title) setErrors(prev => ({ ...prev, title: validateField('title', e.target.value) })); }}
              onBlur={() => handleBlur('title', title)}
              placeholder="e.g. iPhone 14 Pro Max 256GB"
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50 focus:bg-white transition-all text-sm ${touched.title && errors.title ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
              maxLength={100}
            />
            {touched.title && errors.title && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {errors.title}</p>}
            <p className="text-xs text-gray-400 mt-1 text-right">{title.length}/100</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Description <span className="text-xs text-gray-400 font-normal">(recommended)</span></label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); if (touched.description) setErrors(prev => ({ ...prev, description: validateField('description', e.target.value) })); }}
              onBlur={() => handleBlur('description', description)}
              placeholder="Describe your item in detail..."
              rows={4}
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none bg-gray-50 focus:bg-white transition-all text-sm ${touched.description && errors.description ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
              maxLength={2000}
            />
            {touched.description && errors.description && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {errors.description}</p>}
            <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/2000</p>
          </div>

          {/* Price & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Price (ZAR) <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">R</span>
                <input
                  type="number" value={price}
                  onChange={(e) => { setPrice(e.target.value); if (touched.price) setErrors(prev => ({ ...prev, price: validateField('price', e.target.value) })); }}
                  onBlur={() => handleBlur('price', price)}
                  placeholder="0" min="1" step="1"
                  className={`w-full pl-8 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50 focus:bg-white transition-all text-sm ${touched.price && errors.price ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                />
              </div>
              {touched.price && errors.price && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {errors.price}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Category <span className="text-red-500">*</span></label>
              <select
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); if (touched.category) setErrors(prev => ({ ...prev, category: validateField('category', e.target.value) })); }}
                onBlur={() => handleBlur('category', categoryId)}
                className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-gray-50 focus:bg-white cursor-pointer text-sm ${touched.category && errors.category ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
              >
                <option value="">Select category</option>
                {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              {touched.category && errors.category && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {errors.category}</p>}
            </div>
          </div>

          {/* Condition & Negotiable */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value as ListingCondition)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-gray-50 focus:bg-white cursor-pointer text-sm">
                {Object.entries(CONDITION_LABELS).map(([val, label]) => (<option key={val} value={val}>{label}</option>))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer px-4 py-2.5 border border-gray-200 rounded-xl w-full hover:bg-blue-50 transition-all">
                <input type="checkbox" checked={isNegotiable} onChange={(e) => setIsNegotiable(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-700">Price Negotiable</span>
              </label>
            </div>
          </div>

          {/* Location & Province */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Location <span className="text-red-500">*</span></label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text" value={location}
                  onChange={(e) => { setLocation(e.target.value); if (touched.location) setErrors(prev => ({ ...prev, location: validateField('location', e.target.value) })); }}
                  onBlur={() => handleBlur('location', location)}
                  placeholder="e.g. Kimberley"
                  className={`w-full pl-9 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50 focus:bg-white transition-all text-sm ${touched.location && errors.location ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                />
              </div>
              {touched.location && errors.location && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {errors.location}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Province</label>
              <select value={province} onChange={(e) => setProvince(e.target.value as SAProvince)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-gray-50 focus:bg-white cursor-pointer text-sm">
                {SA_PROVINCES.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
          </div>

          {/* Commission Disclosure */}
          <CommissionDisclosure price={parseFloat(price) || 0} agreed={commissionAgreed} onAgreeChange={setCommissionAgreed} />

          {/* Validation Summary */}
          {hasErrors && Object.values(touched).some(Boolean) && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Please fix the following:</p>
                <ul className="text-xs text-red-600 mt-1 space-y-0.5">
                  {Object.entries(errors).filter(([_, v]) => v).map(([key, msg]) => (<li key={key}>{msg}</li>))}
                </ul>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all">Cancel</button>
            <button
              type="submit"
              disabled={submitting || isAnyUploading}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Publishing...</>
              ) : isAnyUploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
              ) : (
                'Publish Listing'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateListingModal;
