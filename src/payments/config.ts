import { PayPalSandbox } from './paypal.ts';
export function sandboxProvider() {
  const {PAYPAL_CLIENT_ID:clientId,PAYPAL_CLIENT_SECRET:clientSecret,PAYPAL_MERCHANT_ID:merchantId,PAYPAL_WEBHOOK_ID:webhookId}=process.env;
  if (!clientId || !clientSecret || !merchantId) throw new Error('PayPal sandbox credentials are not configured');
  return new PayPalSandbox({clientId,clientSecret,merchantId,webhookId});
}
