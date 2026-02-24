import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Payment',
  paid: 'Payment Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const STATUS_DESCRIPTIONS: Record<string, { buyer: string; seller: string }> = {
  paid: {
    buyer: 'Your payment has been confirmed. The seller will ship your item soon.',
    seller: 'Payment received! Please ship the item and update tracking.',
  },
  shipped: {
    buyer: 'Your order has been shipped! Track your delivery in real-time.',
    seller: 'Order marked as shipped. The buyer has been notified.',
  },
  delivered: {
    buyer: 'Your order has been delivered! Please confirm receipt.',
    seller: 'Order delivered successfully. Funds will be released soon.',
  },
  cancelled: {
    buyer: 'Your order has been cancelled.',
    seller: 'The order has been cancelled.',
  },
  refunded: {
    buyer: 'Your refund has been processed.',
    seller: 'A refund has been issued for this order.',
  },
};

const OrderStatusNotifier: React.FC = () => {
  const { user } = useAuth();
  const previousStatusesRef = useRef<Map<string, string>>(new Map());
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!user) return;

    // Load current order statuses first to avoid false notifications on mount
    const loadCurrentStatuses = async () => {
      try {
        const { data } = await supabase
          .from('orders')
          .select('id, status')
          .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);
        if (data) {
          data.forEach((order: any) => {
            previousStatusesRef.current.set(order.id, order.status);
          });
        }
      } catch (err) {
        console.error('Failed to load initial order statuses:', err);
      }
      // Allow notifications after initial load
      setTimeout(() => {
        initialLoadRef.current = false;
      }, 2000);
    };

    loadCurrentStatuses();

    // Subscribe to order changes
    const channel = supabase
      .channel(`order-status-notifier-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
      }, (payload) => {
        if (initialLoadRef.current) return;

        const newOrder = payload.new as any;
        const oldOrder = payload.old as any;
        if (!newOrder) return;

        // Only notify for orders belonging to this user
        const isBuyer = newOrder.buyer_id === user.id;
        const isSeller = newOrder.seller_id === user.id;
        if (!isBuyer && !isSeller) return;

        const previousStatus = previousStatusesRef.current.get(newOrder.id) || oldOrder?.status;
        const newStatus = newOrder.status;

        // Only notify if status actually changed
        if (previousStatus === newStatus) return;

        // Update the ref
        previousStatusesRef.current.set(newOrder.id, newStatus);

        const role = isBuyer ? 'buyer' : 'seller';
        const statusLabel = STATUS_LABELS[newStatus] || newStatus;
        const description = STATUS_DESCRIPTIONS[newStatus]?.[role] || `Order status changed to ${statusLabel}`;

        // Determine toast variant
        const variant = newStatus === 'cancelled' || newStatus === 'refunded' ? 'destructive' as const : undefined;

        toast({
          title: `Order ${statusLabel}`,
          description,
          variant,
          duration: 8000,
        });
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
      }, (payload) => {
        if (initialLoadRef.current) return;

        const newOrder = payload.new as any;
        if (!newOrder) return;

        const isBuyer = newOrder.buyer_id === user.id;
        const isSeller = newOrder.seller_id === user.id;
        if (!isBuyer && !isSeller) return;

        previousStatusesRef.current.set(newOrder.id, newOrder.status);

        if (isSeller) {
          toast({
            title: 'New Order Received!',
            description: 'A buyer has placed an order. Check your dashboard for details.',
            duration: 10000,
          });
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'order_tracking',
      }, (payload) => {
        if (initialLoadRef.current) return;

        const tracking = payload.new as any;
        if (!tracking) return;

        // Check if this tracking belongs to one of the user's orders
        const orderId = tracking.order_id;
        if (!previousStatusesRef.current.has(orderId)) return;

        // Don't show if the user themselves created the update
        if (tracking.updated_by === user.id) return;

        const status = tracking.status || 'Updated';
        const hasPhoto = !!tracking.photo_url;

        toast({
          title: `Tracking: ${status}`,
          description: hasPhoto
            ? `Delivery photo proof has been uploaded. ${tracking.notes || ''}`
            : tracking.notes || `Shipment status updated to ${status}`,
          duration: 6000,
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // This component renders nothing - it's purely for side effects
  return null;
};

export default OrderStatusNotifier;
