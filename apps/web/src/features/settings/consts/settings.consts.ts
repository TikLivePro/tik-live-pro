export { AVATAR_COLORS } from '@/lib/avatar.consts';

import type { PaymentMethodOption } from '../interfaces/payment.interfaces';

export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: 'stripe',       labelKey: 'paymentMethod.card',        descKey: 'paymentMethod.cardDesc' },
  { id: 'cash',         labelKey: 'paymentMethod.cash',        descKey: 'paymentMethod.cashDesc' },
  { id: 'mobile_money', labelKey: 'paymentMethod.mobileMoney', descKey: 'paymentMethod.mobileMoneyDesc' },
];
