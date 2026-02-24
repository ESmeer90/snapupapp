import React from 'react';
import {
  Bell, Camera, Clock, AlertTriangle, Truck, Package, ChevronRight
} from 'lucide-react';

export type ReminderLevel = 'out_for_delivery' | 'gentle' | 'moderate' | 'urgent';

interface DeliveryReminderBannerProps {
  orderId: string;
  listingTitle: string;
  listingImage?: string;
  reminderLevel: ReminderLevel;
  deliveredAt?: string;
  onConfirmDelivery: (orderId: string) => void;
  onDismiss?: (orderId: string) => void;
}

const REMINDER_CONFIG: Record<ReminderLevel, {
  bg: string;
  border: string;
  iconBg: string;
  iconColor: string;
  titleColor: string;
  textColor: string;
  title: string;
  message: string;
  buttonBg: string;
  buttonText: string;
  icon: React.ReactNode;
}> = {
  out_for_delivery: {
    bg: 'bg-gradient-to-r from-cyan-50 to-blue-50',
    border: 'border-cyan-200',
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-600',
    titleColor: 'text-cyan-800',
    textColor: 'text-cyan-600',
    title: 'Your package is out for delivery!',
    message: 'Have your phone ready to take a delivery confirmation photo when it arrives.',
    buttonBg: 'bg-cyan-600 hover:bg-cyan-700',
    buttonText: 'View Order',
    icon: <Truck className="w-5 h-5" />,
  },
  gentle: {
    bg: 'bg-gradient-to-r from-blue-50 to-indigo-50',
    border: 'border-blue-200',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-800',
    textColor: 'text-blue-600',
    title: 'Your package has been delivered',
    message: 'The courier marked your order as delivered. Please confirm receipt and upload a photo.',
    buttonBg: 'bg-blue-600 hover:bg-blue-700',
    buttonText: 'Confirm Delivery',
    icon: <Package className="w-5 h-5" />,
  },
  moderate: {
    bg: 'bg-gradient-to-r from-amber-50 to-orange-50',
    border: 'border-amber-200',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-800',
    textColor: 'text-amber-600',
    title: 'Delivery confirmation needed',
    message: 'Your order was delivered over 12 hours ago. Please confirm receipt with a photo to release payment to the seller.',
    buttonBg: 'bg-amber-600 hover:bg-amber-700',
    buttonText: 'Confirm Now',
    icon: <Clock className="w-5 h-5" />,
  },
  urgent: {
    bg: 'bg-gradient-to-r from-red-50 to-orange-50',
    border: 'border-red-200',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    titleColor: 'text-red-800',
    textColor: 'text-red-600',
    title: 'Urgent: Confirm your delivery',
    message: 'Your order was delivered over 24 hours ago. Please confirm receipt immediately or raise a dispute if there\'s an issue.',
    buttonBg: 'bg-red-600 hover:bg-red-700',
    buttonText: 'Confirm Delivery',
    icon: <AlertTriangle className="w-5 h-5" />,
  },
};

/**
 * Determine the reminder level based on how long ago the courier marked it as delivered
 */
export function getDeliveryReminderLevel(
  courierDeliveredAt: string | undefined,
  buyerConfirmed: boolean
): ReminderLevel | null {
  if (buyerConfirmed || !courierDeliveredAt) return null;

  const deliveredTime = new Date(courierDeliveredAt).getTime();
  const now = Date.now();
  const hoursSince = (now - deliveredTime) / (1000 * 60 * 60);

  if (hoursSince >= 24) return 'urgent';
  if (hoursSince >= 12) return 'moderate';
  if (hoursSince >= 1) return 'gentle';
  return null; // Less than 1 hour, no reminder yet
}

const DeliveryReminderBanner: React.FC<DeliveryReminderBannerProps> = ({
  orderId,
  listingTitle,
  listingImage,
  reminderLevel,
  deliveredAt,
  onConfirmDelivery,
  onDismiss,
}) => {
  const config = REMINDER_CONFIG[reminderLevel];

  return (
    <div className={`${config.bg} rounded-2xl border-2 ${config.border} p-4 relative overflow-hidden`}>
      {/* Pulse indicator for urgent */}
      {reminderLevel === 'urgent' && (
        <div className="absolute top-3 right-3">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
          <div className="w-3 h-3 bg-red-500 rounded-full absolute top-0" />
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-10 h-10 ${config.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 ${config.iconColor}`}>
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className={`text-sm font-bold ${config.titleColor}`}>{config.title}</h4>
              <p className={`text-xs ${config.textColor} mt-0.5`}>{config.message}</p>
            </div>
          </div>

          {/* Order info */}
          <div className="flex items-center gap-3 mt-2.5">
            {listingImage && (
              <img
                src={listingImage}
                alt={listingTitle}
                className="w-10 h-10 rounded-lg object-cover border border-gray-200"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate">{listingTitle}</p>
              {deliveredAt && (
                <p className="text-[10px] text-gray-400">
                  Delivered {new Date(deliveredAt).toLocaleDateString('en-ZA', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}
            </div>
            <button
              onClick={() => onConfirmDelivery(orderId)}
              className={`flex items-center gap-1.5 px-3 py-2 ${config.buttonBg} text-white font-semibold rounded-xl text-xs transition-all shadow-lg flex-shrink-0`}
            >
              <Camera className="w-3.5 h-3.5" />
              {config.buttonText}
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Dismiss for non-urgent */}
      {onDismiss && reminderLevel !== 'urgent' && (
        <button
          onClick={() => onDismiss(orderId)}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <span className="sr-only">Dismiss</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default DeliveryReminderBanner;
