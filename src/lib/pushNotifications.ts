export type PushSubscriptionData = {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export type NotificationPayload = {
  title?: string
  body: string
  tag?: string
  url?: string
  icon?: string
}

const VAPID_PUBLIC_KEY = 'BLx1HqNl8d9Q3kOjZtYf2E8d7J9o5pK3mN6rL1sW7tY2uI4vQ8xZ3cF5aA6bB'

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  
  return outputArray
}

export const isPushSupported = () => {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export const subscribeToPush = async (): Promise<PushSubscription | null> => {
  if (!isPushSupported()) {
    console.log('Push notifications are not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })

    return subscription
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error)
    return null
  }
}

export const unsubscribeFromPush = async (): Promise<boolean> => {
  if (!isPushSupported()) return false

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    
    if (subscription) {
      await subscription.unsubscribe()
      return true
    }
    
    return false
  } catch (error) {
    console.error('Failed to unsubscribe from push notifications:', error)
    return false
  }
}

export const getCurrentSubscription = async (): Promise<PushSubscription | null> => {
  if (!isPushSupported()) return null

  try {
    const registration = await navigator.serviceWorker.ready
    return await registration.pushManager.getSubscription()
  } catch (error) {
    console.error('Failed to get current push subscription:', error)
    return null
  }
}

export const serializeSubscription = (subscription: PushSubscription): PushSubscriptionData => {
  const subscriptionData = subscription.toJSON()
  
  if (!subscriptionData.keys || !subscriptionData.endpoint) {
    throw new Error('Invalid subscription data')
  }

  return {
    endpoint: subscriptionData.endpoint,
    keys: {
      p256dh: subscriptionData.keys.p256dh,
      auth: subscriptionData.keys.auth
    }
  }
}

export const requestPushPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) {
    throw new Error('Notifications are not supported')
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }

  if (Notification.permission === 'denied') {
    return 'denied'
  }

  return await Notification.requestPermission()
}

export const sendPushNotification = async (payload: NotificationPayload): Promise<void> => {
  // This would typically be called from a backend service
  // For now, we'll store it locally for the service worker to pick up
  const notifications = JSON.parse(localStorage.getItem('pending-push-notifications') || '[]')
  notifications.push({
    ...payload,
    timestamp: Date.now(),
    id: Math.random().toString(36).substr(2, 9)
  })
  
  // Keep only last 50 notifications
  if (notifications.length > 50) {
    notifications.splice(0, notifications.length - 50)
  }
  
  localStorage.setItem('pending-push-notifications', JSON.stringify(notifications))
}
