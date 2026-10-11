self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = new URL(
    event.notification.data?.url || '/chat',
    self.location.origin
  ).href

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windowClients) => {
        const currentClient = windowClients.find(
          (client) => new URL(client.url).origin === self.location.origin
        )

        if (currentClient) {
          if ('navigate' in currentClient && currentClient.url !== targetUrl) {
            await currentClient.navigate(targetUrl)
          }
          return currentClient.focus()
        }

        return self.clients.openWindow(targetUrl)
      })
  )
})
