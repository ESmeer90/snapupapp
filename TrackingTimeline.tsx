import React, { useState } from 'react';
import type { OrderTracking, TrackingStatus } from '@/types';
import { TRACKING_STATUS_CONFIG } from '@/types';
import {
  Clock, Package, Truck, MapPin, CheckCircle2, XCircle,
  RotateCcw, Settings, CircleDot, Camera, ZoomIn, X, Shield, ImageIcon
} from 'lucide-react';

const statusIcons: Record<TrackingStatus, React.ReactNode> = {
  'Pending': <Clock className="w-4 h-4" />,
  'Processing': <Settings className="w-4 h-4" />,
  'Shipped': <Package className="w-4 h-4" />,
  'In Transit': <Truck className="w-4 h-4" />,
  'Out for Delivery': <MapPin className="w-4 h-4" />,
  'Delivered': <CheckCircle2 className="w-4 h-4" />,
  'Cancelled': <XCircle className="w-4 h-4" />,
  'Returned': <RotateCcw className="w-4 h-4" />,
};

// Lightbox component for viewing delivery photos full-size
const PhotoLightbox: React.FC<{
  photoUrl: string;
  status: string;
  date: string;
  onClose: () => void;
}> = ({ photoUrl, status, date, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="relative max-w-3xl w-full max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 p-2 bg-white text-gray-600 rounded-full shadow-xl hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Photo */}
        <div className="rounded-2xl overflow-hidden bg-gray-900 shadow-2xl">
          <img
            src={photoUrl}
            alt={`Delivery photo - ${status}`}
            className="w-full max-h-[75vh] object-contain"
          />
          <div className="p-4 bg-gray-900/90">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-400" />
                <span className="text-white font-medium text-sm">Delivery Photo Proof</span>
              </div>
              <span className="text-gray-400 text-xs">|</span>
              <span className="text-gray-300 text-xs">{status}</span>
              <span className="text-gray-400 text-xs">|</span>
              <span className="text-gray-400 text-xs">{date}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs text-gray-400">
                This photo serves as proof of delivery and can be used for dispute resolution.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Inline delivery photo component
const DeliveryPhoto: React.FC<{
  photoUrl: string;
  status: string;
  date: string;
}> = ({ photoUrl, status, date }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div className="mt-2 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
        <ImageIcon className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-500">Delivery photo unavailable</span>
      </div>
    );
  }

  return (
    <>
      <div className="mt-2.5">
        <div
          className="relative group cursor-pointer rounded-xl overflow-hidden border-2 border-emerald-200 hover:border-emerald-300 transition-all shadow-sm hover:shadow-md"
          onClick={() => setLightboxOpen(true)}
        >
          <img
            src={photoUrl}
            alt={`Delivery photo - ${status}`}
            className="w-full h-32 sm:h-40 object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2 shadow-lg">
              <ZoomIn className="w-4 h-4 text-gray-700" />
              <span className="text-sm font-medium text-gray-700">View full size</span>
            </div>
          </div>
          {/* Badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-emerald-600/90 backdrop-blur-sm text-white px-2 py-1 rounded-lg">
            <Camera className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Proof of Delivery</span>
          </div>
        </div>
      </div>

      {lightboxOpen && (
        <PhotoLightbox
          photoUrl={photoUrl}
          status={status}
          date={date}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
};

interface TrackingTimelineProps {
  tracking: OrderTracking[];
  trackingNumber?: string | null;
  carrier?: string | null;
}

const TrackingTimeline: React.FC<TrackingTimelineProps> = ({ tracking, trackingNumber, carrier }) => {
  if (!tracking || tracking.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        No tracking updates yet
      </div>
    );
  }

  const latestStatus = tracking[tracking.length - 1]?.status;

  // Check if any tracking entries have photos
  const hasAnyPhotos = tracking.some(entry => entry.photo_url);

  return (
    <div className="space-y-4">
      {/* Tracking Number & Carrier */}
      {(trackingNumber || carrier) && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
          {carrier && (
            <div className="flex items-center gap-2 text-sm">
              <Truck className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">Carrier:</span>
              <span className="font-medium text-gray-900">{carrier}</span>
            </div>
          )}
          {trackingNumber && (
            <div className="flex items-center gap-2 text-sm">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">Tracking #:</span>
              <span className="font-mono font-medium text-blue-600">{trackingNumber}</span>
            </div>
          )}
        </div>
      )}

      {/* Delivery Photo Summary */}
      {hasAnyPhotos && (
        <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
          <Camera className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="text-xs text-emerald-700 font-medium">
            Delivery photo proof attached ({tracking.filter(t => t.photo_url).length} photo{tracking.filter(t => t.photo_url).length > 1 ? 's' : ''})
          </span>
        </div>
      )}

      {/* Timeline */}
      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gray-200" />

        <div className="space-y-0">
          {tracking.map((entry, idx) => {
            const isLatest = idx === tracking.length - 1;
            const config = TRACKING_STATUS_CONFIG[entry.status] || TRACKING_STATUS_CONFIG['Pending'];
            const icon = statusIcons[entry.status] || <CircleDot className="w-4 h-4" />;
            const date = new Date(entry.created_at);
            const dateStr = `${date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })} at ${date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`;

            return (
              <div key={entry.id} className="relative pb-4 last:pb-0">
                {/* Dot */}
                <div className={`absolute -left-6 top-0.5 w-[22px] h-[22px] rounded-full flex items-center justify-center z-10 ${
                  isLatest
                    ? `${config.bgColor} ${config.color} ring-2 ring-white shadow-sm`
                    : 'bg-gray-100 text-gray-400'
                }`}>
                  {icon}
                </div>

                {/* Content */}
                <div className={`ml-3 ${isLatest ? '' : 'opacity-70'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${isLatest ? config.color : 'text-gray-600'}`}>
                      {entry.status}
                    </span>
                    {isLatest && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${config.bgColor} ${config.color}`}>
                        CURRENT
                      </span>
                    )}
                    {entry.photo_url && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                        <Camera className="w-2.5 h-2.5" /> PHOTO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {dateStr}
                  </p>
                  {entry.notes && (
                    <p className="text-xs text-gray-500 mt-1 bg-gray-50 rounded-lg px-2.5 py-1.5 inline-block">
                      {entry.notes}
                    </p>
                  )}
                  {entry.tracking_number && !trackingNumber && (
                    <p className="text-xs text-gray-500 mt-1">
                      Tracking: <span className="font-mono text-blue-600">{entry.tracking_number}</span>
                    </p>
                  )}
                  {entry.carrier && !carrier && (
                    <p className="text-xs text-gray-500">
                      via {entry.carrier}
                    </p>
                  )}

                  {/* Delivery Photo - Inline */}
                  {entry.photo_url && (
                    <DeliveryPhoto
                      photoUrl={entry.photo_url}
                      status={entry.status}
                      date={dateStr}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Progress Bar */}
      <TrackingProgressBar currentStatus={latestStatus} />
    </div>
  );
};

// Visual progress bar showing delivery stages
const TrackingProgressBar: React.FC<{ currentStatus: TrackingStatus }> = ({ currentStatus }) => {
  const stages: { status: TrackingStatus; label: string }[] = [
    { status: 'Pending', label: 'Ordered' },
    { status: 'Processing', label: 'Processing' },
    { status: 'Shipped', label: 'Shipped' },
    { status: 'In Transit', label: 'In Transit' },
    { status: 'Delivered', label: 'Delivered' },
  ];

  if (currentStatus === 'Cancelled' || currentStatus === 'Returned') {
    const config = TRACKING_STATUS_CONFIG[currentStatus];
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bgColor}`}>
        {statusIcons[currentStatus]}
        <span className={`text-sm font-medium ${config.color}`}>{currentStatus}</span>
      </div>
    );
  }

  const statusOrder: TrackingStatus[] = ['Pending', 'Processing', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered'];
  const currentIdx = statusOrder.indexOf(currentStatus);

  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-center justify-between relative">
        {/* Background line */}
        <div className="absolute top-3 left-4 right-4 h-0.5 bg-gray-200" />
        {/* Progress line */}
        <div
          className="absolute top-3 left-4 h-0.5 bg-blue-500 transition-all duration-500"
          style={{ width: `${Math.min(100, (currentIdx / (stages.length - 1)) * 100)}%`, maxWidth: 'calc(100% - 32px)' }}
        />

        {stages.map((stage, idx) => {
          const stageIdx = statusOrder.indexOf(stage.status);
          const isComplete = currentIdx >= stageIdx;
          const isCurrent = currentStatus === stage.status || (stage.status === 'In Transit' && currentStatus === 'Out for Delivery');

          return (
            <div key={stage.status} className="flex flex-col items-center relative z-10">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                isComplete
                  ? isCurrent
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                    : 'bg-blue-500 text-white'
                  : 'bg-white border-2 border-gray-300 text-gray-400'
              }`}>
                {isComplete ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span className={`text-[10px] mt-1.5 font-medium whitespace-nowrap ${
                isComplete ? 'text-blue-600' : 'text-gray-400'
              }`}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TrackingTimeline;
