import React from 'react';
import type { Order, OrderTracking } from '@/types';
import {
  CreditCard, Bell, Truck, Package, CheckCircle2, Clock, Shield,
  AlertTriangle, RotateCcw, XCircle, DollarSign
} from 'lucide-react';

interface OrderLifecycleTimelineProps {
  order: Order;
  tracking: OrderTracking[];
  isBuyer: boolean;
}

interface LifecycleStep {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  timestamp: string | null;
  color: string;
  bgColor: string;
}

const formatTimestamp = (ts: string | null): string => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago · ${time}`;
  if (diffHours < 24) return `${diffHours}h ago · ${time}`;
  if (diffDays < 7) return `${diffDays}d ago · ${date} ${time}`;
  return `${date} ${time}`;
};

const OrderLifecycleTimeline: React.FC<OrderLifecycleTimelineProps> = ({ order, tracking, isBuyer }) => {
  // Derive timestamps from order and tracking data
  const orderCreatedAt = order.created_at;
  const paidAt = (order as any).paid_at || 
    (order.status !== 'pending' && order.status !== 'cancelled' ? order.updated_at : null);
  
  // Find the first "Processing" tracking entry (seller was notified)
  const processingEntry = tracking.find(t => t.status === 'Processing');
  const sellerNotifiedAt = processingEntry?.created_at || 
    (order.status !== 'pending' && order.status !== 'cancelled' ? paidAt : null);
  
  // Find the first "Shipped" tracking entry
  const shippedEntry = tracking.find(t => t.status === 'Shipped');
  const shippedAt = shippedEntry?.created_at || null;
  
  // Find "In Transit" entry
  const inTransitEntry = tracking.find(t => t.status === 'In Transit');
  const inTransitAt = inTransitEntry?.created_at || null;

  // Find "Out for Delivery" entry
  const outForDeliveryEntry = tracking.find(t => t.status === 'Out for Delivery');
  const outForDeliveryAt = outForDeliveryEntry?.created_at || null;
  
  // Find the "Delivered" tracking entry
  const deliveredEntry = tracking.find(t => t.status === 'Delivered');
  const deliveredAt = deliveredEntry?.created_at || 
    (order.status === 'delivered' ? order.updated_at : null);

  // Escrow release
  const escrowReleasedAt = (order as any).escrow_status === 'released' ? order.updated_at : null;

  // Build lifecycle steps
  const steps: LifecycleStep[] = [
    {
      key: 'ordered',
      label: 'Order Placed',
      description: isBuyer ? 'You placed this order' : 'Buyer placed this order',
      icon: <CreditCard className="w-4 h-4" />,
      timestamp: orderCreatedAt,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      key: 'paid',
      label: 'Payment Confirmed',
      description: 'PayFast payment verified & funds held in escrow',
      icon: <CheckCircle2 className="w-4 h-4" />,
      timestamp: ['paid', 'shipped', 'delivered'].includes(order.status) ? (paidAt || orderCreatedAt) : null,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
    },
    {
      key: 'notified',
      label: 'Seller Notified',
      description: 'Seller received order notification via email',
      icon: <Bell className="w-4 h-4" />,
      timestamp: sellerNotifiedAt,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      key: 'shipped',
      label: 'Item Shipped',
      description: shippedEntry?.carrier 
        ? `Shipped via ${shippedEntry.carrier}${shippedEntry.tracking_number ? ` · ${shippedEntry.tracking_number}` : ''}`
        : 'Seller dispatched the item',
      icon: <Truck className="w-4 h-4" />,
      timestamp: shippedAt,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
  ];

  // Only add in-transit and out-for-delivery if they have timestamps
  if (inTransitAt) {
    steps.push({
      key: 'in_transit',
      label: 'In Transit',
      description: inTransitEntry?.notes || 'Package is on its way',
      icon: <Truck className="w-4 h-4" />,
      timestamp: inTransitAt,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100',
    });
  }

  if (outForDeliveryAt) {
    steps.push({
      key: 'out_for_delivery',
      label: 'Out for Delivery',
      description: outForDeliveryEntry?.notes || 'Package is out for delivery',
      icon: <Package className="w-4 h-4" />,
      timestamp: outForDeliveryAt,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
    });
  }

  steps.push({
    key: 'delivered',
    label: 'Delivery Confirmed',
    description: deliveredEntry?.photo_url 
      ? 'Delivery confirmed with photo proof'
      : 'Item delivered successfully',
    icon: <Package className="w-4 h-4" />,
    timestamp: deliveredAt,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
  });

  // Add escrow release step if applicable
  if (escrowReleasedAt || order.status === 'delivered') {
    steps.push({
      key: 'escrow',
      label: 'Funds Released',
      description: escrowReleasedAt 
        ? 'Escrow funds released to seller'
        : '48-hour escrow period (funds release after dispute window)',
      icon: <DollarSign className="w-4 h-4" />,
      timestamp: escrowReleasedAt,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    });
  }

  // Handle cancelled/refunded
  if (order.status === 'cancelled') {
    steps.push({
      key: 'cancelled',
      label: 'Order Cancelled',
      description: 'This order was cancelled',
      icon: <XCircle className="w-4 h-4" />,
      timestamp: order.updated_at,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    });
  }

  if (order.status === 'refunded') {
    steps.push({
      key: 'refunded',
      label: 'Refund Processed',
      description: 'Funds returned to buyer',
      icon: <RotateCcw className="w-4 h-4" />,
      timestamp: order.updated_at,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    });
  }

  // Find the last completed step index
  const lastCompletedIdx = steps.reduce((acc, step, idx) => {
    return step.timestamp ? idx : acc;
  }, -1);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-5 flex items-center gap-2">
        <Clock className="w-4 h-4 text-indigo-600" />
        Order Lifecycle
      </h4>

      <div className="relative">
        {steps.map((step, idx) => {
          const isCompleted = !!step.timestamp;
          const isLast = idx === steps.length - 1;
          const isNext = !isCompleted && idx === lastCompletedIdx + 1;

          return (
            <div key={step.key} className="flex gap-4 relative">
              {/* Vertical line */}
              {!isLast && (
                <div className={`absolute left-[15px] top-[32px] w-0.5 bottom-0 ${
                  isCompleted ? 'bg-emerald-300' : 'bg-gray-200'
                }`} />
              )}

              {/* Icon circle */}
              <div className={`relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                isCompleted 
                  ? `${step.bgColor} ${step.color}` 
                  : isNext 
                    ? 'bg-gray-100 text-gray-400 ring-2 ring-gray-300 ring-offset-1 animate-pulse'
                    : 'bg-gray-100 text-gray-300'
              }`}>
                {step.icon}
              </div>

              {/* Content */}
              <div className={`flex-1 pb-5 ${isLast ? 'pb-0' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`text-sm font-semibold ${isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                      {step.label}
                    </p>
                    <p className={`text-xs mt-0.5 ${isCompleted ? 'text-gray-500' : 'text-gray-300'}`}>
                      {step.description}
                    </p>
                  </div>
                  {step.timestamp && (
                    <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                      {formatTimestamp(step.timestamp)}
                    </span>
                  )}
                  {isNext && !step.timestamp && (
                    <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5 italic">
                      Pending...
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* POPIA compliance note */}
      <div className="mt-4 flex items-start gap-2 p-2.5 bg-gray-50 border border-gray-100 rounded-lg">
        <Shield className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-gray-400">
          Timestamps are recorded for order transparency and dispute resolution per POPIA Section 14.
        </p>
      </div>
    </div>
  );
};

export default OrderLifecycleTimeline;
