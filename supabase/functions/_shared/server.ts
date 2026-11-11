import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { canonicalEntitlement, refreshEntitlement } from './subscriptions.js';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
export function preflight(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  return null;
}
export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Server configuration is incomplete.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function authenticatedUser(req: Request, admin: ReturnType<typeof adminClient>) {
  const header = req.headers.get('Authorization');
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, token };
}
export function subscriptionConfig() {
  const key = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!key) throw new Error('Subscriptions are not configured yet.');
  const environment = Deno.env.get('REVENUECAT_ENVIRONMENT') || 'PRODUCTION';
  if (!['PRODUCTION', 'SANDBOX'].includes(environment)) throw new Error('Invalid subscription environment.');
  return { key, environment, entitlementId: Deno.env.get('REVENUECAT_ENTITLEMENT_ID') || 'sync_pro' };
}
export async function syncEntitlement(admin: ReturnType<typeof adminClient>, userId: string, eventId: string | null = null) {
  const config = subscriptionConfig();
  return await refreshEntitlement({
    userId, eventId, environment: config.environment, entitlementId: config.entitlementId,
    begin: async (id: string, event: string | null) => {
      const { data, error } = await admin.rpc('begin_subscription_sync', { target_user_id: id, webhook_event_id: event });
      if (error) throw error;
      return data;
    },
    fetchCustomer: async (id: string) => {
      const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${config.key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      // Never translate auth, rate-limit, timeout, or upstream failures to an expired subscription.
      if (!response.ok) throw new Error(`Subscription service unavailable (${response.status}).`);
      return await response.json();
    },
    apply: async (id: string, generation: number, entitlement: ReturnType<typeof canonicalEntitlement>, event: string | null) => {
      const { data, error } = await admin.rpc('apply_subscription_sync', {
        target_user_id: id, sync_generation: generation, valid_until: entitlement.expires_at,
        purchase_store: entitlement.store, purchase_environment: entitlement.environment, webhook_event_id: event,
      });
      if (error) throw error;
      return data;
    },
  });
}
export async function readEntitlement(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await admin.from('entitlements').select('entitlement_id,expires_at,store,environment,updated_at')
    .eq('user_id', userId).eq('entitlement_id', 'pro').maybeSingle();
  if (error) throw error;
  return data;
}
