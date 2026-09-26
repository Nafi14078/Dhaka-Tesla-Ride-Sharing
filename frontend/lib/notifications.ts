import { getSession } from "@/lib/auth";

export type Notice = { id: string; message: string; createdAt: number };

export function addNotification(id: string, message: string) {
  const user = getSession();
  if (!user) return;

  const key = `notifications:${user.id}`;
  let existing: Notice[] = [];
  try {
    existing = JSON.parse(localStorage.getItem(key) || "[]");
  } catch { existing = []; }
  if (existing.some((notice) => notice.id === id)) return;

  const notices = [{ id, message, createdAt: Date.now() }, ...existing].slice(0, 30);
  localStorage.setItem(key, JSON.stringify(notices));
  window.dispatchEvent(new Event("notifications-updated"));
}
