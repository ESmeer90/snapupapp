import React, { useState, useRef, useCallback } from 'react';
import {
  Camera, CheckCircle2, Shield, X, Loader2, Upload, Trash2,
  Package, ImagePlus, AlertTriangle, Smartphone, FileCheck, Timer
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { uploadDeliveryPhoto, addTrackingUpdate, updateOrderStatus, createLocalPreview, revokeLocalPreview, confirmDeliveryEscrow } from '@/lib/api';


interface BuyerDeliveryConfirmModalProps {
  orderId: string;
  userId: string;
  listingTitle: string;
  listingImage?: string;
  onClose: () => void;
  onConfirmed: (photoUrl?: string) => void;
}

type ConfirmStep = 'upload' | 'confirming' | 'success';

const BuyerDeliveryConfirmModal: React.FC<BuyerDeliveryConfirmModalProps> = ({
  orderId,
  userId,
  listingTitle,
  listingImage,
  onClose,
  onConfirmed,
}) => {
  const [step, setStep] = useState<ConfirmStep>('upload');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please select a JPEG, PNG, or WebP image.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image smaller than 10MB.',
        variant: 'destructive',
      });
      return;
    }

    // Clean up previous preview
    if (photoPreview) revokeLocalPreview(photoPreview);

    setPhotoFile(file);
    setPhotoPreview(createLocalPreview(file));
    setError(null);
  }, [photoPreview]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleRemovePhoto = () => {
    if (photoPreview) revokeLocalPreview(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleConfirmDelivery = async (withPhoto: boolean) => {
    setStep('confirming');
    setUploading(true);
    setError(null);

    let photoUrl: string | undefined;

    try {
      // Step 1: Upload photo if provided
      if (withPhoto && photoFile) {
        setUploadProgress('Uploading delivery photo...');
        try {
          photoUrl = await uploadDeliveryPhoto(photoFile, orderId);
          setUploadProgress('Photo uploaded successfully!');
        } catch (photoErr: any) {
          console.error('Delivery photo upload failed:', photoErr);
          // Don't block confirmation if photo upload fails
          toast({
            title: 'Photo Upload Failed',
            description: `Delivery will be confirmed without photo: ${photoErr.message || 'Upload failed'}`,
            variant: 'destructive',
            duration: 6000,
          });
          setUploadProgress('Photo upload failed, confirming without photo...');
        }
      }

      // Step 2: Add tracking update
      setUploadProgress(photoUrl ? 'Recording delivery confirmation with photo...' : 'Recording delivery confirmation...');
      await addTrackingUpdate({
        order_id: orderId,
        status: 'Delivered',
        notes: photoUrl
          ? 'Delivery confirmed by buyer with photo proof'
          : 'Delivery confirmed by buyer',
        photo_url: photoUrl,
        updated_by: userId,
      });

      // Step 3: Update order status
      setUploadProgress('Updating order status...');
      await updateOrderStatus(orderId, 'delivered');

      // Step 4: Start 48-hour escrow countdown
      setUploadProgress('Starting escrow protection...');
      try {
        const escrowResult = await confirmDeliveryEscrow(orderId);
        console.log('[BuyerDeliveryConfirm] Escrow countdown started, release at:', escrowResult.release_at);
      } catch (escrowErr: any) {
        console.warn('[BuyerDeliveryConfirm] Escrow creation failed (non-blocking):', escrowErr);
        // Non-blocking: escrow will be created on next status check
      }

      // Success!
      setStep('success');
      setUploadProgress('');

      toast({
        title: 'Delivery Confirmed!',
        description: photoUrl
          ? 'Thank you! Your delivery has been confirmed with photo proof.'
          : 'Thank you! The order has been marked as delivered.',
        duration: 6000,
      });

      // Notify parent after a brief delay so user sees success state
      setTimeout(() => {
        onConfirmed(photoUrl);
      }, 2000);

    } catch (err: any) {
      console.error('Delivery confirmation failed:', err);
      setError(err.message || 'Failed to confirm delivery. Please try again.');
      setStep('upload');
      setUploadProgress('');
      toast({
        title: 'Confirmation Failed',
        description: err.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (photoPreview) revokeLocalPreview(photoPreview);
    };
  }, [photoPreview]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && step !== 'confirming') onClose(); }}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom-4 duration-300">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Confirm Delivery</h3>
              <p className="text-xs text-gray-500">Verify you received your item</p>
            </div>
          </div>
          {step !== 'confirming' && (
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Success State */}
        {step === 'success' && (
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5 animate-in zoom-in duration-500">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delivery Confirmed!</h3>
            <p className="text-gray-500 text-sm mb-4">
              Your order has been marked as delivered. Thank you for confirming!
            </p>
            {photoPreview && (
              <div className="mt-4 rounded-xl overflow-hidden border-2 border-emerald-200 max-w-xs mx-auto">
                <div className="relative">
                  <img src={photoPreview} alt="Delivery proof" className="w-full h-32 object-cover" />
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-emerald-600/90 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg">
                    <FileCheck className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">Photo Attached</span>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl mt-5 text-left">
              <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                Your delivery confirmation is recorded securely. If you have any issues, you can still open a dispute within 7 days.
              </p>
            </div>
          </div>
        )}

        {/* Confirming State */}
        {step === 'confirming' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Confirming Delivery...</h3>
            <p className="text-sm text-gray-500 mb-4">{uploadProgress || 'Please wait...'}</p>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '70%' }} />
            </div>
          </div>
        )}

        {/* Upload State (main form) */}
        {step === 'upload' && (
          <div className="p-5 space-y-5">

            {/* Item Preview */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                <img
                  src={listingImage || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100&h=100&fit=crop'}
                  alt={listingTitle}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{listingTitle}</p>
                <p className="text-xs text-gray-500 font-mono">#{orderId.slice(0, 12).toUpperCase()}</p>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Confirmation Failed</p>
                  <p className="text-xs text-red-600 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* Photo Upload Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-600" />
                  Delivery Photo Proof
                </label>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Recommended</span>
              </div>

              {!photoPreview ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                    isDragging
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/30'
                  }`}
                >
                  <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <ImagePlus className="w-7 h-7 text-emerald-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Add a photo of your delivered item
                  </p>
                  <p className="text-xs text-gray-400 mb-4">
                    Take a photo or upload from your gallery. JPEG, PNG, or WebP (max 10MB)
                  </p>

                  <div className="flex items-center gap-3 justify-center">
                    {/* Camera Button (mobile-friendly) */}
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 text-sm"
                    >
                      <Smartphone className="w-4 h-4" />
                      Take Photo
                    </button>

                    {/* Gallery Button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-all text-sm"
                    >
                      <Upload className="w-4 h-4" />
                      Upload
                    </button>
                  </div>

                  {/* Hidden file inputs */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={handleInputChange}
                    className="hidden"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleInputChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-200 shadow-sm">
                  <img
                    src={photoPreview}
                    alt="Delivery photo preview"
                    className="w-full h-48 object-cover"
                  />
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="absolute top-3 right-3 p-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shadow-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {/* File info overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-white text-xs font-medium truncate">
                        {photoFile?.name}
                      </span>
                      <span className="text-white/70 text-[10px] ml-auto flex-shrink-0">
                        {photoFile ? `${(photoFile.size / (1024 * 1024)).toFixed(1)}MB` : ''}
                      </span>
                    </div>
                  </div>
                  {/* Verified badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-emerald-600/90 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg">
                    <Camera className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">Ready</span>
                  </div>
                </div>
              )}

              {/* Photo benefits notice */}
              <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl mt-3">
                <Shield className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-emerald-700 font-medium">Why add a photo?</p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">
                    Photo proof helps protect both buyers and sellers. It serves as evidence of delivery condition and can be used for dispute resolution if needed.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              {/* Primary: Confirm with Photo */}
              {photoFile && (
                <button
                  onClick={() => handleConfirmDelivery(true)}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 text-sm"
                >
                  <Upload className="w-4.5 h-4.5" />
                  Confirm Delivery with Photo
                </button>
              )}

              {/* Secondary: Confirm without Photo */}
              <button
                onClick={() => handleConfirmDelivery(false)}
                disabled={uploading}
                className={`w-full flex items-center justify-center gap-2.5 px-5 py-3.5 font-semibold rounded-2xl transition-all text-sm disabled:opacity-50 ${
                  photoFile
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200 font-bold'
                }`}
              >
                <CheckCircle2 className="w-4.5 h-4.5" />
                {photoFile ? 'Confirm Without Photo' : 'Confirm Delivery'}
              </button>

              {/* Cancel */}
              <button
                onClick={onClose}
                disabled={uploading}
                className="w-full px-5 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            {/* POPIA Notice */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <Shield className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-blue-700">
                Your delivery photo is stored securely per POPIA and may be used for dispute resolution. By confirming, you acknowledge receipt of the item in its current condition.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BuyerDeliveryConfirmModal;
