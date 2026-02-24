import React, { useState } from 'react';
import {
  Camera, CheckCircle2, Shield, Clock, ZoomIn, X, MapPin, FileCheck, Download
} from 'lucide-react';

interface DeliveryPhotoConfirmationProps {
  photoUrl: string;
  uploadedAt: string;
  orderId: string;
  status: string;
  uploaderName?: string;
  onDismiss?: () => void;
}

const DeliveryPhotoConfirmation: React.FC<DeliveryPhotoConfirmationProps> = ({
  photoUrl,
  uploadedAt,
  orderId,
  status,
  uploaderName,
  onDismiss,
}) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  const uploadDate = new Date(uploadedAt);
  const dateStr = uploadDate.toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const timeStr = uploadDate.toLocaleTimeString('en-ZA', {
    hour: '2-digit', minute: '2-digit',
  });

  if (imageError) {
    return (
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <Camera className="w-4 h-4" />
          <span className="text-sm">Delivery photo unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl border-2 border-emerald-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-emerald-100/60 border-b border-emerald-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center">
              <FileCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-800">Delivery Photo Confirmed</h4>
              <p className="text-[10px] text-emerald-600">Proof of delivery uploaded</p>
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 text-emerald-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Photo */}
        <div className="p-3">
          <div
            className="relative group cursor-pointer rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all"
            onClick={() => setLightboxOpen(true)}
          >
            <img
              src={photoUrl}
              alt="Delivery proof"
              className="w-full h-40 sm:h-48 object-cover transition-transform duration-300 group-hover:scale-105"
              onError={() => setImageError(true)}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2 shadow-lg">
                <ZoomIn className="w-4 h-4 text-gray-700" />
                <span className="text-sm font-medium text-gray-700">View full size</span>
              </div>
            </div>
            {/* Verified badge */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-emerald-600/90 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wide">Verified</span>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="px-4 pb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <Clock className="w-3.5 h-3.5 text-emerald-500" />
              <span>{dateStr} at {timeStr}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <Camera className="w-3.5 h-3.5 text-emerald-500" />
              <span>{status}</span>
            </div>
          </div>
          {uploaderName && (
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <MapPin className="w-3.5 h-3.5 text-emerald-500" />
              <span>Uploaded by {uploaderName}</span>
            </div>
          )}
          <div className="text-[10px] text-emerald-600 font-mono">
            Order #{orderId.slice(0, 12).toUpperCase()}
          </div>
        </div>

        {/* POPIA Notice */}
        <div className="flex items-start gap-2 px-4 py-2.5 bg-emerald-100/50 border-t border-emerald-200">
          <Shield className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-emerald-700">
            This photo serves as proof of delivery per POPIA. It may be used for dispute resolution and is stored securely.
          </p>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-w-3xl w-full max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute -top-3 -right-3 z-10 p-2 bg-white text-gray-600 rounded-full shadow-xl hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="rounded-2xl overflow-hidden bg-gray-900 shadow-2xl">
              <img
                src={photoUrl}
                alt="Delivery proof - full size"
                className="w-full max-h-[75vh] object-contain"
              />
              <div className="p-4 bg-gray-900/90">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-white font-medium text-sm">Verified Delivery Photo</span>
                  </div>
                  <span className="text-gray-500 text-xs">|</span>
                  <span className="text-gray-300 text-xs">{status}</span>
                  <span className="text-gray-500 text-xs">|</span>
                  <span className="text-gray-400 text-xs">{dateStr} at {timeStr}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Shield className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-gray-400">
                    Stored securely for dispute resolution. POPIA compliant.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DeliveryPhotoConfirmation;
