// braintree-web-drop-in ships no types. Minimal shim for the calls the admin card form makes
// (same shape as Rex's shim in frontend/src/vite-env.d.ts).
declare module 'braintree-web-drop-in' {
  export interface Dropin {
    requestPaymentMethod(): Promise<{ nonce: string; type: string }>;
    teardown(): Promise<void>;
  }
  export interface DropinCreateOptions {
    authorization: string;
    container: HTMLElement | string;
    vaultManager?: boolean;
    card?: Record<string, unknown> | false;
    paypal?: false;
    venmo?: false;
  }
  const dropin: { create(options: DropinCreateOptions): Promise<Dropin> };
  export default dropin;
}
