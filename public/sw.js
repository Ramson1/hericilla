/* Hericilla admin — Web Push service worker (paired with @hericilla/push-web) */
self.addEventListener("push", (event) => {
  let payload = { title: "Hericilla", body: "" };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    if (event.data) payload = { title: "Hericilla", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: payload.data ?? {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(clients.openWindow(url));
});
