export type PaymentMethod = 'stripe' | 'cash' | 'mobile_money';

export interface PaymentMethodOption {
  id: PaymentMethod;
  labelKey: 'paymentMethod.card' | 'paymentMethod.cash' | 'paymentMethod.mobileMoney';
  descKey: 'paymentMethod.cardDesc' | 'paymentMethod.cashDesc' | 'paymentMethod.mobileMoneyDesc';
}

export interface ManualOrderResult {
  orderId: string;
  instructions: string;
  status: 'pending';
}

export interface CheckoutResult {
  checkoutUrl?: string;
  orderId?: string;
  instructions?: string;
  status?: 'pending';
}
