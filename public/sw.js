import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

const APP_NOTIFICATION_TITLE = 'ZC'
const APP_NOTIFICATION_ICON = '/pwa-192.png'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

const resolveNotificationPayload = (data) => ({
  title: data?.title || APP_NOTIFICATION_TITLE,
  options: {
    body: data?.body || data?.content || '你有一則新的 ZC 通知。',
    icon: data?.icon || APP_NOTIFICATION_ICON,
    badge: data?.badge || APP_NOTIFICATION_ICON,
    tag: data?.tag || 'zc-notification',
    data: {
      url: data?.url || '/',
      ...(data?.data || {})
    },
    renotify: false,
    requireInteraction: false
  }
})

// LRU Cache implementation for notifications
class NotificationLRUCache {
  constructor(maxSize = 100, maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days
    this.maxSize = maxSize
    this.maxAge = maxAge
    this.cache = new Map()
    this.timestamps = new Map()
  }

  get(key) {
    if (!this.cache.has(key)) {
      return null
    }

    // Check if expired
    const timestamp = this.timestamps.get(key)
    if (Date.now() - timestamp > this.maxAge) {
      this.delete(key)
      return null
    }

    // Move to end (most recently used)
    const value = this.cache.get(key)
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key, value) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value
      this.delete(oldestKey)
    }

    // Remove existing key to update position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }

    this.cache.set(key, value)
    this.timestamps.set(key, Date.now())
  }

  delete(key) {
    this.cache.delete(key)
    this.timestamps.delete(key)
  }

  has(key) {
    return this.get(key) !== null
  }

  cleanup() {
    const now = Date.now()
    const expiredKeys = []
    
    for (const [key, timestamp] of this.timestamps.entries()) {
      if (now - timestamp > this.maxAge) {
        expiredKeys.push(key)
      }
    }

    expiredKeys.forEach(key => this.delete(key))
    return expiredKeys.length
  }

  size() {
    return this.cache.size
  }

  clear() {
    this.cache.clear()
    this.timestamps.clear()
  }
}

// Notification tracking with LRU cache
const notificationCache = new NotificationLRUCache(100, 7 * 24 * 60 * 60 * 1000) // 100 items, 7 days
const OFFLINE_CACHE_KEY = 'zc-offline-notifications'
const CACHE_VERSION = 'v1'

// Load notifications from IndexedDB with cleanup
const loadNotificationsFromCache = async () => {
  try {
    const stored = await self.caches.open('zc-notifications')
    const response = await stored.match(OFFLINE_CACHE_KEY)
    
    if (response) {
      const data = await response.json()
      
      // Check version and migrate if needed
      if (data.version !== CACHE_VERSION) {
        console.log('Cache version mismatch, clearing old cache')
        await stored.delete(OFFLINE_CACHE_KEY)
        return
      }

      // Load into LRU cache and cleanup expired items
      if (data.notifications) {
        data.notifications.forEach(item => {
          notificationCache.set(item.tag, item)
        })
      }

      // Cleanup expired items
      const cleanedCount = notificationCache.cleanup()
      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired notifications`)
        await saveNotificationsToCache()
      }
    }
  } catch (error) {
    console.log('Failed to load notifications from cache:', error)
  }
}

// Save notifications to IndexedDB
const saveNotificationsToCache = async () => {
  try {
    const stored = await self.caches.open('zc-notifications')
    
    // Convert cache to array for storage
    const notifications = []
    for (const [tag, item] of notificationCache.cache.entries()) {
      notifications.push({
        tag,
        ...item,
        timestamp: notificationCache.timestamps.get(tag)
      })
    }

    const data = {
      version: CACHE_VERSION,
      notifications,
      timestamp: Date.now()
    }

    await stored.put(OFFLINE_CACHE_KEY, new Response(JSON.stringify(data)))
  } catch (error) {
    console.log('Failed to save notifications to cache:', error)
  }
}

// Check if notification should be sent (LRU cache approach)
const shouldSendNotification = (tag, notificationData = null) => {
  const existing = notificationCache.get(tag)
  
  if (existing) {
    // Notification already sent recently
    return false
  }

  // Add to cache
  notificationCache.set(tag, notificationData || { sent: true })
  
  // Save to persistent storage
  saveNotificationsToCache()
  
  return true
}

// Periodic cleanup task using setTimeout for better reliability
const scheduleCleanup = () => {
  const cleanupAndReschedule = () => {
    const cleanedCount = notificationCache.cleanup()
    if (cleanedCount > 0) {
      console.log(`Periodic cleanup: removed ${cleanedCount} expired notifications`)
      saveNotificationsToCache()
    }
    
    // Schedule next cleanup (6 hours)
    setTimeout(cleanupAndReschedule, 6 * 60 * 60 * 1000)
  }
  
  // Start first cleanup after 6 hours
  setTimeout(cleanupAndReschedule, 6 * 60 * 60 * 1000)
}

// Initialize notification tracking with LRU cache
loadNotificationsFromCache()
scheduleCleanup()

// Background sync for missed notifications
self.addEventListener('sync', (event) => {
  if (event.tag === 'zc-background-sync') {
    event.waitUntil(handleBackgroundSync())
  }
})

const handleBackgroundSync = async () => {
  try {
    // Ensure notification cache is up to date
    await loadNotificationsFromCache()
    
    // Cleanup expired items
    const cleanedCount = notificationCache.cleanup()
    if (cleanedCount > 0) {
      console.log(`Background sync: cleaned up ${cleanedCount} expired notifications`)
      await saveNotificationsToCache()
    }
  } catch (error) {
    console.log('Background sync failed:', error)
  }
}

// Periodic sync for checking missed notifications (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'zc-periodic-sync') {
    event.waitUntil(handleBackgroundSync())
  }
})

self.addEventListener('push', (event) => {
  let data = {}

  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data = { body: event.data.text() }
    }
  }

  const payload = resolveNotificationPayload(data)
  
  // Check if we should send this notification to prevent duplicates
  if (shouldSendNotification(payload.options.tag)) {
    event.waitUntil(
      self.registration.showNotification(payload.title, payload.options)
        .then(() => {
          // Store notification for offline access
          storeNotificationForOffline(payload)
        })
        .catch((error) => {
          console.error('Failed to show notification:', error)
        })
    )
  }
})

// Store notifications for offline access using LRU cache
const storeNotificationForOffline = async (notification) => {
  try {
    // Use the LRU cache for offline storage
    const notificationId = notification.tag || `offline-${Date.now()}`
    notificationCache.set(notificationId, {
      ...notification,
      id: notificationId,
      storedForOffline: true
    })
    
    // Save to persistent storage
    await saveNotificationsToCache()
    
    console.log(`Stored notification ${notificationId} for offline access`)
  } catch (error) {
    console.error('Failed to store notification for offline:', error)
  }
}

// Get offline notifications
const getOfflineNotifications = async () => {
  try {
    const offlineNotifications = []
    
    for (const [tag, item] of notificationCache.cache.entries()) {
      if (item.storedForOffline) {
        offlineNotifications.push({
          tag,
          ...item,
          timestamp: notificationCache.timestamps.get(tag)
        })
      }
    }
    
    // Sort by timestamp (newest first)
    return offlineNotifications.sort((a, b) => b.timestamp - a.timestamp)
  } catch (error) {
    console.error('Failed to get offline notifications:', error)
    return []
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'ZC_SHOW_NOTIFICATION') return

  const payload = resolveNotificationPayload(event.data.payload || {})
  
  // Check if we should send this notification to prevent duplicates
  if (shouldSendNotification(payload.options.tag)) {
    event.waitUntil(
      self.registration.showNotification(payload.title, payload.options)
        .then(() => {
          // Notification shown successfully
        })
        .catch((error) => {
          console.error('Failed to show notification from message:', error)
        })
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const rawUrl = event.notification.data?.url || '/'
  const targetUrl = new URL(rawUrl, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const sameOriginClient = clientList.find((client) => client.url.startsWith(self.location.origin))
      if (sameOriginClient) {
        if ('navigate' in sameOriginClient && sameOriginClient.url !== targetUrl) {
          sameOriginClient.navigate(targetUrl)
        }
        return sameOriginClient.focus()
      }

      return self.clients.openWindow(targetUrl)
    })
  )
})
