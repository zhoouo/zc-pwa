// @ts-ignore - Deno environment types
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore - Supabase types
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
  user_id: string
  couple_id: string
}

interface NotificationPayload {
  title?: string
  body: string
  tag?: string
  url?: string
  icon?: string
}

// VAPID keys - these should be generated properly for production
// Use web-push library or similar for proper VAPID implementation
// @ts-ignore - Deno global
const VAPID_PRIVATE_KEY = (globalThis as any).Deno?.env.get('VAPID_PRIVATE_KEY') || 'YOUR_VAPID_PRIVATE_KEY_HERE'
// @ts-ignore - Deno global
const VAPID_PUBLIC_KEY = (globalThis as any).Deno?.env.get('VAPID_PUBLIC_KEY') || 'YOUR_VAPID_PUBLIC_KEY_HERE'
// @ts-ignore - Deno global
const VAPID_EMAIL = (globalThis as any).Deno?.env.get('VAPID_EMAIL') || 'notifications@zc.app'

// Web Push Protocol implementation
class WebPushClient {
  private privateKey: string
  private publicKey: string
  private email: string

  constructor(privateKey: string, publicKey: string, email: string) {
    this.privateKey = privateKey
    this.publicKey = publicKey
    this.email = email
  }

  // Generate VAPID JWT token
  private generateVAPIDToken(audience: string): string {
    const header = { alg: 'ES256', typ: 'JWT' }
    const payload = {
      sub: `mailto:${this.email}`,
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12 hours
      iat: Math.floor(Date.now() / 1000)
    }

    // Simplified JWT generation - in production use proper crypto libraries
    const encodedHeader = btoa(JSON.stringify(header))
    const encodedPayload = btoa(JSON.stringify(payload))
    const signature = 'SIGNATURE_HERE' // This would be properly signed with the private key

    return `${encodedHeader}.${encodedPayload}.${signature}`
  }

  // Encrypt notification payload
  private async encryptPayload(payload: NotificationPayload, subscription: PushSubscription): Promise<Uint8Array> {
    // Simplified encryption - in production use proper Web Push encryption
    const jsonPayload = JSON.stringify(payload)
    return new TextEncoder().encode(jsonPayload)
  }

  // Send push notification using Web Push Protocol
  async sendNotification(subscription: PushSubscription, payload: NotificationPayload): Promise<boolean> {
    try {
      const audience = new URL(subscription.endpoint).origin
      const vapidToken = this.generateVAPIDToken(audience)
      const encryptedPayload = await this.encryptPayload(payload, subscription)

      const headers = {
        'TTL': '86400', // 24 hours
        'Urgency': 'normal',
        'Content-Type': 'application/octet-stream',
        'Authorization': `vapid t=${vapidToken}, k=${this.publicKey}`,
        'Encryption': 'key=ENCRYPTION_KEY_HERE', // Would be properly generated
        'Crypto-Key': `dh=${subscription.keys.p256dh}, p256ecdsa=${this.publicKey}`,
        'Content-Encoding': 'aes128gcm'
      }

      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers,
        body: encryptedPayload
      })

      if (response.ok) {
        console.log('Push notification sent successfully')
        return true
      } else {
        console.error('Push notification failed:', response.status, response.statusText)
        return false
      }
    } catch (error) {
      console.error('Error sending push notification:', error)
      return false
    }
  }
}

// @ts-ignore - Deno serve function
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // @ts-ignore - Deno environment
    const supabaseClient = createClient(
      (globalThis as any).Deno?.env.get('SUPABASE_URL') ?? '',
      (globalThis as any).Deno?.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { method } = req

    if (method === 'POST') {
      const body = await req.json()
      
      if (body.type === 'subscribe') {
        // Save push subscription
        const { subscription, userId, coupleId } = body
        
        const { error } = await supabaseClient
          .from('push_subscriptions')
          .upsert({
            user_id: userId,
            couple_id: coupleId,
            endpoint: subscription.endpoint,
            p256dh_key: subscription.keys.p256dh,
            auth_key: subscription.keys.auth,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          })

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: corsHeaders }
          )
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: corsHeaders }
        )
      }
      
      if (body.type === 'send') {
        // Send push notification
        const { notification, coupleId, excludeUserId } = body
        
        // Get all subscriptions for the couple except the sender
        const { data: subscriptions, error } = await supabaseClient
          .from('push_subscriptions')
          .select('*')
          .eq('couple_id', coupleId)
          .neq('user_id', excludeUserId || '')

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: corsHeaders }
          )
        }

        if (!subscriptions || subscriptions.length === 0) {
          return new Response(
            JSON.stringify({ success: true, sent: 0 }),
            { status: 200, headers: corsHeaders }
          )
        }

        // Initialize Web Push client
        const pushClient = new WebPushClient(VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_EMAIL)

        // Send push notifications to all subscriptions using Web Push Protocol
        const pushPromises = subscriptions.map(async (sub: PushSubscription) => {
          try {
            const success = await pushClient.sendNotification(sub, notification)
            return success
          } catch (error) {
            console.error('Failed to send push notification:', error)
            return false
          }
        })

        const results = await Promise.allSettled(pushPromises)
        const sent = results.filter(r => r.status === 'fulfilled' && r.value).length

        return new Response(
          JSON.stringify({ success: true, sent }),
          { status: 200, headers: corsHeaders }
        )
      }
    }

    return new Response(
      JSON.stringify({ error: 'Invalid request' }),
      { status: 400, headers: corsHeaders }
    )

  } catch (error: any) {
    console.error('Push notification error:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    )
  }
})

async function getVAPIDToken(): Promise<string> {
  // This is a simplified VAPID token generation
  // In production, you'd use a proper VAPID library
  const header = {
    aud: 'https://localhost:5174',
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12 hours
    sub: `mailto:${VAPID_EMAIL}`
  }
  
  return btoa(JSON.stringify(header))
}
