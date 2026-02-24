import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { addTrackingUpdate, uploadDeliveryPhoto, createLocalPreview, revokeLocalPreview } from '@/lib/api';
import type { TrackingStatus, OrderTracking } from '@/types';
import { TRACKING_STATUSES, SA_CARRIERS } from '@/types';
import {
  X, Truck, Package, Loader2, AlertTriangle, CheckCircle2, FileText,
  Camera, ImageIcon, Upload, Trash2
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface TrackingUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderTitle: string;
  currentStatus?: string;
  currentTrackingNumber?: string | null;
  currentCarrier?: string | null;
  onTrackingUpdated: (tracking: OrderTracking) => void;
}

const TrackingUpdateModal: React.FC<TrackingUpdateModalProps> = ({
  isOpen,
  onClose,
  orderId,
  orderTitle,
  currentStatus,
  currentTrackingNumber,
  currentCarrier,
  onTrackingUpdated,
}) => {
  const { user } = useAuth();
  const [status, setStatus] = useState<TrackingStatus>((currentStatus as TrackingStatus) || 'Processing');
  const [trackingNumber, setTrackingNumber] = useState(currentTrackingNumber || '');
  const [carrier, setCarrier] = useState(currentCarrier || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Delivery photo state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const showPhotoUpload = ['Out for Delivery', 'Delivered'].includes(status);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!status) {
      newErrors.status = 'Please select a status';
    }

    // Require tracking number for shipped/in-transit statuses
    if (['Shipped', 'In Transit', 'Out for Delivery'].includes(status) && !trackingNumber.trim() && !currentTrackingNumber) {
      newErrors.trackingNumber = 'Tracking number is recommended for shipped items';
    }

    // Require carrier for shipped statuses
    if (['Shipped', 'In Transit', 'Out for Delivery'].includes(status) && !carrier && !currentCarrier) {
      newErrors.carrier = 'Please select a carrier';
    }

    setErrors(newErrors);
    // Only block on status error, tracking/carrier are warnings
    return !newErrors.status;
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please select a JPEG, PNG, or WebP image.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image smaller than 10MB.',
        variant: 'destructive',
      });
      return;
    }

    // Clean up old preview
    if (photoPreview) {
      revokeLocalPreview(photoPreview);
    }

    setPhotoFile(file);
    setPhotoPreview(createLocalPreview(file));
  };

  const handleRemovePhoto = () => {
    if (photoPreview) {
      revokeLocalPreview(photoPreview);
    }
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !validate()) return;

    setSubmitting(true);
    try {
      let photoUrl: string | undefined;

      // Upload delivery photo if one was selected
      if (photoFile && showPhotoUpload) {
        setUploadingPhoto(true);
        setPhotoUploadProgress('Compressing photo...');
        try {
          setPhotoUploadProgress('Uploading delivery photo...');
          photoUrl = await uploadDeliveryPhoto(photoFile, orderId);
          setPhotoUploadProgress('Photo uploaded successfully!');
        } catch (photoErr: any) {
          console.error('Delivery photo upload failed:', photoErr);
          toast({
            title: 'Photo Upload Warning',
            description: `Tracking will be updated without photo: ${photoErr.message || 'Upload failed'}`,
            variant: 'destructive',
          });
          // Continue without photo - don't block the tracking update
        } finally {
          setUploadingPhoto(false);
        }
      }

      const tracking = await addTrackingUpdate({
        order_id: orderId,
        status,
        tracking_number: trackingNumber.trim() || undefined,
        carrier: carrier || undefined,
        notes: notes.trim() || undefined,
        photo_url: photoUrl,
        updated_by: user.id,
      });

      toast({
        title: 'Tracking Updated',
        description: `Order status updated to "${status}"${photoUrl ? ' with delivery photo' : ''}`,
      });

      // Clean up
      if (photoPreview) revokeLocalPreview(photoPreview);

      onTrackingUpdated(tracking);
      onClose();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to update tracking',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
      setUploadingPhoto(false);
      setPhotoUploadProgress('');
    }
  };

  // Determine which statuses are available based on current status
  const getAvailableStatuses = (): TrackingStatus[] => {
    const statusOrder: TrackingStatus[] = ['Pending', 'Processing', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered'];
    const currentIdx = statusOrder.indexOf(currentStatus as TrackingStatus);

    // Always allow Cancelled
    const available = statusOrder.filter((_, idx) => idx > currentIdx || idx === currentIdx);
    if (!available.includes('Cancelled')) available.push('Cancelled');
    if (!available.includes('Returned') && currentIdx >= 2) available.push('Returned');

    return available.length > 0 ? available : TRACKING_STATUSES;
  };

  const availableStatuses = getAvailableStatuses();

  const statusDescriptions: Record<string, string> = {
    'Processing': 'You are preparing the item for shipment',
    'Shipped': 'Item has been handed to the courier/carrier',
    'In Transit': 'Item is on its way to the buyer',
    'Out for Delivery': 'Item is out for final delivery',
    'Delivered': 'Item has been delivered to the buyer',
    'Cancelled': 'Order has been cancelled',
    'Returned': 'Item is being returned',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Update Tracking</h2>
              <p className="text-xs text-gray-500 truncate max-w-[250px]">{orderTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-xl transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form - Scrollable */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Tracking Status <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {availableStatuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setStatus(s); setErrors((prev) => ({ ...prev, status: '' })); }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-all text-left ${
                    status === s
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Package className="w-4 h-4 flex-shrink-0" />
                  {s}
                </button>
              ))}
            </div>
            {errors.status && (
              <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {errors.status}
              </p>
            )}
            {statusDescriptions[status] && (
              <p className="text-xs text-blue-600 mt-2 bg-blue-50 rounded-lg px-3 py-2">
                {statusDescriptions[status]}
              </p>
            )}
          </div>

          {/* Carrier */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Carrier / Courier
              {['Shipped', 'In Transit', 'Out for Delivery'].includes(status) && (
                <span className="text-amber-500 text-xs ml-1">(recommended)</span>
              )}
            </label>
            <select
              value={carrier}
              onChange={(e) => { setCarrier(e.target.value); setErrors((prev) => ({ ...prev, carrier: '' })); }}
              className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${
                errors.carrier ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
              }`}
            >
              <option value="">Select carrier...</option>
              {SA_CARRIERS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {errors.carrier && (
              <p className="text-amber-500 text-xs mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {errors.carrier}
              </p>
            )}
          </div>

          {/* Tracking Number */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Tracking Number
              {['Shipped', 'In Transit', 'Out for Delivery'].includes(status) && (
                <span className="text-amber-500 text-xs ml-1">(recommended)</span>
              )}
            </label>
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => { setTrackingNumber(e.target.value); setErrors((prev) => ({ ...prev, trackingNumber: '' })); }}
              placeholder="e.g., TCG12345678"
              className={`w-full px-3 py-2.5 border rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${
                errors.trackingNumber ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
              }`}
            />
            {errors.trackingNumber && (
              <p className="text-amber-500 text-xs mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {errors.trackingNumber}
              </p>
            )}
          </div>

          {/* Delivery Photo Upload - Only for Out for Delivery / Delivered */}
          {showPhotoUpload && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                <Camera className="w-3.5 h-3.5 inline mr-1" />
                Delivery Photo Proof
                <span className="text-gray-400 text-xs ml-1 font-normal">(optional - helps with disputes)</span>
              </label>

              {!photoPreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
                >
                  <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 group-hover:bg-blue-100 rounded-xl flex items-center justify-center transition-colors">
                    <Camera className="w-6 h-6 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 group-hover:text-blue-600 transition-colors">
                    Add delivery photo
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Take a photo of the delivered package at the doorstep
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    JPEG, PNG, or WebP (max 10MB)
                  </p>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden border-2 border-emerald-200 bg-emerald-50">
                  <img
                    src={photoPreview}
                    alt="Delivery photo preview"
                    className="w-full h-48 object-cover"
                  />
                  <div className="absolute top-2 right-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-lg"
                      title="Remove photo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-white text-xs font-medium">
                        {photoFile?.name} ({((photoFile?.size || 0) / (1024 * 1024)).toFixed(1)}MB)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoSelect}
                className="hidden"
              />

              {status === 'Delivered' && (
                <div className="mt-2 flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-700">
                    Delivery photos serve as proof of delivery and can help resolve disputes. 
                    Capture the package at the delivery location.
                  </p>
                </div>
              )}

              {status === 'Out for Delivery' && (
                <div className="mt-2 flex items-start gap-2 p-2.5 bg-cyan-50 border border-cyan-100 rounded-lg">
                  <Truck className="w-3.5 h-3.5 text-cyan-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-cyan-700">
                    You can attach a photo showing the package loaded for delivery. 
                    A delivery confirmation photo can be added with the final "Delivered" update.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <FileText className="w-3.5 h-3.5 inline mr-1" />
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this update..."
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
            />
            <p className="text-xs text-gray-400 text-right mt-0.5">{notes.length}/500</p>
          </div>

          {/* Upload Progress */}
          {uploadingPhoto && photoUploadProgress && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
              <span className="text-sm text-blue-700 font-medium">{photoUploadProgress}</span>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {uploadingPhoto ? 'Uploading Photo...' : 'Updating...'}
                </>
              ) : (
                <>
                  {showPhotoUpload && photoFile ? (
                    <Upload className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {showPhotoUpload && photoFile ? 'Update with Photo' : 'Update Tracking'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TrackingUpdateModal;
