// Loaded into the generated service worker with workbox.importScripts.
// Tapping a notification opens the app: focus an open window if there is one, otherwise open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => client.url.startsWith(scope) && 'focus' in client);
    if (open) return open.focus();
    return self.clients.openWindow(scope);
  })());
});
