import { jwtDecode } from "jwt-decode";

export function isJwtExpired(token: string): boolean {
  try {
    const decoded: any = jwtDecode(token);
    if (decoded && typeof decoded.exp === "number") {
      const expirationTime = decoded.exp * 1000;
      const currentTime = Date.now();
      const isExpired = expirationTime <= currentTime;
      console.log("isJwtExpired Check:", {
        expSeconds: decoded.exp,
        expMs: expirationTime,
        nowMs: currentTime,
        diff: expirationTime - currentTime,
        isExpired
      });
      return isExpired;
    }
    console.log("isJwtExpired: No exp field in token or not a number", decoded);
    return false;
  } catch (e) {
    console.log("isJwtExpired: Failed to decode token", e);
    // If we can't decode, treat as invalid/expired
    return true;
  }
}
