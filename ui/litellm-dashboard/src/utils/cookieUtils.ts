/**
 * Utility functions for managing auth tokens
 * STRICTLY uses sessionStorage. NO cookies for tokens.
 */

import { getProxyBaseUrl } from "@/components/networking";

/**
 * Clears the token from sessionStorage and logs out from backend
 */
export async function removeAuthToken() {
  if (typeof window === "undefined") {
    return;
  }

  // Get token before clearing
  const token = sessionStorage.getItem("token");

  // Clear from session storage immediately
  sessionStorage.removeItem("token");

  // Call backend logout in background
  if (token) {
    try {
      fetch(`${getProxyBaseUrl()}/v2/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        keepalive: true,
      }).catch((e) => console.error("Failed to logout from server", e));
    } catch (e) {
      console.error("Failed to initiate logout", e);
    }
  }
}

/**
 * Gets the auth token from sessionStorage
 */
export function getAuthToken(): string | null {
  if (typeof window !== "undefined") {
    return sessionStorage.getItem("token");
  }
  return null;
}

/**
 * Sets the auth token in sessionStorage
 */
export function setAuthToken(token: string) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("token", token);
  }
}

/**
 * @deprecated Use getAuthToken() instead. This is kept for compatibility during refactor but will only check sessionStorage for "token".
 */
export function getCookie(name: string) {
  if (name === "token") {
    return getAuthToken();
  }
  if (typeof document === "undefined") return null;
  const cookieValue = document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="));
  return cookieValue ? cookieValue.split("=")[1] : null;
}

/**
 * @deprecated Use removeAuthToken() instead.
 */
export async function clearTokenCookies() {
  return removeAuthToken();
}
