export const APP_NOTIFICATION_TITLE = 'ZC'
export const APP_NOTIFICATION_ICON = '/pwa-192.png'

export type NotificationPermissionState = NotificationPermission | 'unsupported'

type ZcNotificationPayload = {
  body: string
  tag?: string
  title?: string
  url?: string
}

export const isNotificationSupported = () =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator

export const getNotificationPermissionState = (): NotificationPermissionState => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export const requestNotificationPermission = async (): Promise<NotificationPermissionState> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

export const isStandalonePwa = () => {
  if (typeof window === 'undefined') return false
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

export const isAppleMobilePlatform = () => {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export const showZcNotification = async (payload: ZcNotificationPayload) => {
  if (getNotificationPermissionState() !== 'granted') return false

  const options: NotificationOptions = {
    body: payload.body,
    icon: APP_NOTIFICATION_ICON,
    badge: APP_NOTIFICATION_ICON,
    tag: payload.tag,
    data: {
      url: payload.url || '/'
    },
    requireInteraction: false
  }
  const title = payload.title || APP_NOTIFICATION_TITLE

  if ('serviceWorker' in navigator) {
    const registration = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration | null>((resolve) => window.setTimeout(() => resolve(null), 1500))
    ])

    if (registration) {
      // Send notification through service worker to benefit from tracking
      registration.active?.postMessage({
        type: 'ZC_SHOW_NOTIFICATION',
        payload: { title, ...options }
      })
      return true
    }
  }

  // Fallback to direct notification
  new Notification(title, options)
  return true
}
