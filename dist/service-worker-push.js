// Service Worker 推播事件監聽
// 這個文件會在 Service Worker 中執行

// 監聽推播事件
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('Push 接收到，但沒有數據')
    return
  }

  try {
    const data = event.data.json()
    const title = data.title || 'Couple Ledger'
    const options = {
      body: data.body || '您有新的消息',
      icon: '/pwa-192.png',
      badge: '/favicon.svg',
      tag: data.tag || 'notification',
      requireInteraction: false,
      ...data.options,
      data: {
        url: data.url || '/',
        ...data.data
      }
    }

    event.waitUntil(self.registration.showNotification(title, options))
  } catch (error) {
    console.error('處理 Push 事件失敗:', error)
  }
})

// 監聽通知點擊事件
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 檢查是否已有開啟的窗口
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i]
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus()
        }
      }
      // 如果沒有，就開啟新窗口
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen)
      }
    })
  )
})

// 監聽通知關閉事件
self.addEventListener('notificationclose', (event) => {
  console.log('通知已關閉:', event.notification.tag)
})

// 監聽來自主線程的消息
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data
    self.registration.showNotification(title, options)
  }
})
