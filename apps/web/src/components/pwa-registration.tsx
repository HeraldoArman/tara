"use client";

import { useEffect } from "react";

async function removeDevelopmentWorker() {
  const scriptUrl = new URL("/sw.js", window.location.origin).href;
  const scopeUrl = new URL("/", window.location.origin).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const appRegistrations = registrations.filter((registration) => {
    const workers = [
      registration.active,
      registration.waiting,
      registration.installing,
    ].filter((worker) => worker !== null);
    return (
      registration.scope === scopeUrl &&
      workers.length > 0 &&
      workers.every((worker) => worker.scriptURL === scriptUrl)
    );
  });
  const controlsPage =
    navigator.serviceWorker.controller?.scriptURL === scriptUrl;

  await Promise.all(
    appRegistrations.map((registration) => registration.unregister())
  );

  // An existing controller can still serve cached assets until the next navigation.
  if ((appRegistrations.length > 0 || controlsPage) && "caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith("tara-shell-"))
        .map((name) => caches.delete(name))
    );
  }
}

async function configureServiceWorker() {
  try {
    if (process.env.NODE_ENV !== "production") {
      await removeDevelopmentWorker();
      return;
    }

    await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  } catch (error) {
    console.error("Service worker setup failed:", error);
  }
}

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    configureServiceWorker();
  }, []);

  return null;
}
