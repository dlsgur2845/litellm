"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Button, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { jwtDecode } from "jwt-decode";
import { useRouter } from "next/navigation";
import { getProxyBaseUrl } from "@/components/networking";
import { clearTokenCookies, setAuthToken } from "@/utils/cookieUtils";

interface TokenExpirationTimerProps {
    token: string | null;
}

// User activity events that can trigger a silent token renewal
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ["mousedown", "keydown", "scroll", "touchstart"];
// Minimum interval between auto-renewal attempts (guards against retry storms when renewal fails)
const AUTO_RENEW_RETRY_MS = 30000;

const TokenExpirationTimer: React.FC<TokenExpirationTimerProps> = ({ token }) => {
    const router = useRouter();
    // The token currently counted down. Starts from the prop, replaced in-place on
    // renewal so the countdown resets without a page reload.
    const [activeToken, setActiveToken] = useState<string | null>(token);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [showRenewalModal, setShowRenewalModal] = useState(false);
    const [isRenewing, setIsRenewing] = useState(false);

    // Manual renewal cooldown state
    const [renewCooldown, setRenewCooldown] = useState(false);

    // Refs so the activity listeners (bound once per token) always see fresh values
    const activeTokenRef = useRef<string | null>(token);
    const expirationRef = useRef<number | null>(null);
    const totalDurationRef = useRef<number | null>(null);
    const isRenewingRef = useRef(false);
    const lastAutoRenewAttemptRef = useRef(0);

    useEffect(() => {
        setActiveToken(token);
    }, [token]);

    useEffect(() => {
        activeTokenRef.current = activeToken;
        expirationRef.current = null;
        totalDurationRef.current = null;

        if (!activeToken) return;

        let expirationTime: number | null = null;
        let calculatedThreshold = 60000; // Default 60s

        try {
            const decoded: any = jwtDecode(activeToken);
            console.log("TokenExpirationTimer: Decoded token", decoded);
            if (decoded.exp) {
                expirationTime = decoded.exp * 1000; // Convert to ms

                // Adaptive Threshold Logic
                if (decoded.iat) {
                    const iatTime = decoded.iat * 1000;
                    const totalDuration = expirationTime - iatTime;
                    totalDurationRef.current = totalDuration;
                    // If total duration is small (<= 90 seconds to be safe), warn only 10s before
                    if (totalDuration <= 90000) {
                        calculatedThreshold = 10000;
                    }
                }
            } else {
                console.warn("TokenExpirationTimer: No exp claim in token");
            }
        } catch (e) {
            console.error("Failed to decode token", e);
            return;
        }

        if (!expirationTime) return;
        expirationRef.current = expirationTime;
        setTimeRemaining(expirationTime - Date.now());

        const interval = setInterval(() => {
            const now = Date.now();
            const diff = expirationTime! - now;

            if (diff <= 0) {
                clearInterval(interval);
                handleLogout();
            } else {
                setTimeRemaining(diff);

                // Show modal based on adaptive threshold
                if (diff < calculatedThreshold) {
                    setShowRenewalModal(true);
                }
            }
        }, 1000);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeToken]);

    const handleLogout = async () => {
        await clearTokenCookies();
        router.push(`${getProxyBaseUrl()}/ui/login`);
    };

    // Shared renewal routine. silent=true is the activity-triggered path: no toasts on
    // success, no page interaction — only the countdown (and modal, if open) resets.
    const renewToken = useCallback(async (options: { silent?: boolean } = {}) => {
        const { silent = false } = options;
        if (isRenewingRef.current) return;
        isRenewingRef.current = true;
        setIsRenewing(true);
        try {
            const currentToken = activeTokenRef.current;
            if (!currentToken) return;

            const response = await fetch(`${getProxyBaseUrl()}/refresh_token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${currentToken}`
                },
            });

            if (response.ok) {
                const data = await response.json();
                if (data.token) {
                    setAuthToken(data.token);
                    // Swap the token being counted down — resets the timer in place,
                    // no page reload needed (the JWT's embedded key is unchanged).
                    setActiveToken(data.token);
                }
                setShowRenewalModal(false);

                if (!silent) {
                    message.success("Session renewed successfully");
                    // Activate Cooldown for Manual Button
                    setRenewCooldown(true);
                    setTimeout(() => {
                        setRenewCooldown(false);
                    }, 10000); // 10 seconds cooldown
                }
            } else {
                // Server rejected the token (invalidated by another login, expired, ...):
                // the session is unusable either way, so log out on both paths.
                const errorData = await response.json().catch(() => ({}));
                if (!silent) {
                    message.error(`Failed to renew session: ${errorData.detail || "Unknown error"}`);
                }
                handleLogout();
            }
        } catch (error) {
            // Network error: keep the session, a later activity event will retry.
            console.error("Renewal error:", error);
            if (!silent) {
                message.error("Failed to renew session due to network error");
            }
        } finally {
            isRenewingRef.current = false;
            setIsRenewing(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Activity-based silent auto-renewal: once less than half of the token's lifetime
    // remains, any user activity (mouse, keyboard, scroll, touch) renews the session
    // and resets the countdown. A successful renewal pushes the remaining time back
    // above the half-life, which naturally throttles further attempts.
    useEffect(() => {
        if (!activeToken) return;

        const onActivity = () => {
            const expirationTime = expirationRef.current;
            const totalDuration = totalDurationRef.current;
            if (!expirationTime || !totalDuration) return;

            const remaining = expirationTime - Date.now();
            if (remaining <= 0 || remaining >= totalDuration / 2) return;

            const now = Date.now();
            if (isRenewingRef.current || now - lastAutoRenewAttemptRef.current < AUTO_RENEW_RETRY_MS) return;
            lastAutoRenewAttemptRef.current = now;

            console.log("TokenExpirationTimer: Activity detected below token half-life, auto-renewing session");
            renewToken({ silent: true });
        };

        ACTIVITY_EVENTS.forEach((eventName) =>
            window.addEventListener(eventName, onActivity, { passive: true })
        );
        return () =>
            ACTIVITY_EVENTS.forEach((eventName) =>
                window.removeEventListener(eventName, onActivity)
            );
    }, [activeToken, renewToken]);

    const handleRenew = async () => {
        await renewToken({ silent: false });
    };

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    };

    if (timeRemaining === null) return null;

    return (
        <>
            <div className="flex items-center gap-2 mr-4">
                <div className="flex items-center text-gray-500 font-mono text-sm border border-gray-200 rounded px-2 py-1 bg-gray-50">
                    Expires in: {formatTime(timeRemaining)}
                </div>

                {/* Manual Renewal Icon Button (Right side) */}
                {!showRenewalModal && (
                    <Button
                        type="text"
                        size="small"
                        onClick={handleRenew}
                        disabled={renewCooldown || isRenewing}
                        title={renewCooldown ? "Please wait 10s before renewing again" : "Renew session"}
                        icon={<ReloadOutlined spin={isRenewing} />}
                    />
                )}
            </div>

            <Modal
                title="Session Expiring"
                open={showRenewalModal}
                onCancel={handleLogout}
                footer={[
                    <Button key="logout" onClick={handleLogout}>
                        Logout
                    </Button>,
                    <Button key="renew" type="primary" loading={isRenewing} onClick={handleRenew}>
                        Renew Session
                    </Button>,
                ]}
                closable={false}
                maskClosable={false}
            >
                <p>Your session will expire in {formatTime(timeRemaining)}. Please renew your session to continue.</p>
            </Modal>
        </>
    );
};

export default TokenExpirationTimer;
