import { defineEventHandler, getRequestURL, sendRedirect } from "h3";

export default defineEventHandler((event) => {
  if (!import.meta.dev) return;

  const url = getRequestURL(event);
  if (url.hostname !== "127.0.0.1") return;

  // Use the same hostname as local OAuth callbacks, session cookies, and CORS.
  url.hostname = "localhost";
  return sendRedirect(event, url.href, 302);
});
