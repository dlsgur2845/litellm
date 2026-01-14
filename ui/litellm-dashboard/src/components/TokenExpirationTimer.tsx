"use client";

import React, { useEffect, useState } from "react";
import { Modal, Button, message } from "antd";
import { jwtDecode } from "jwt-decode";
import { useRouter } from "next/navigation";
import { getProxyBaseUrl } from "@/components/networking";
import { clearTokenCookies } from "@/utils/cookieUtils";

interface TokenExpirationTimerProps {
    token: string | null;
}

const TokenExpirationTimer: React.FC<TokenExpirationTimerProps> = ({ token }) => {
    const router = useRouter();
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [showRenewalModal, setShowRenewalModal] = useState(false);
    const [isRenewing, setIsRenewing] = useState(false);

    useEffect(() => {
        if (!token) return;

        let expirationTime: number | null = null;
        try {
            const decoded: any = jwtDecode(token);
            console.log("TokenExpirationTimer: Decoded token", decoded);
            if (decoded.exp) {
                expirationTime = decoded.exp * 1000; // Convert to ms
            } else {
                console.warn("TokenExpirationTimer: No exp claim in token");
            }
        } catch (e) {
            console.error("Failed to decode token", e);
            return;
        }

        if (!expirationTime) return;

        const interval = setInterval(() => {
            const now = Date.now();
            const diff = expirationTime! - now;

            if (diff <= 0) {
                clearInterval(interval);
                handleLogout();
            } else {
                setTimeRemaining(diff);

                // Show modal if less than 60 seconds (60000 ms) and not already showing
                if (diff < 60000 && !showRenewalModal) {
                    // Only show if we haven't Just closed it?
                    // Simple logic: if < 60s, show it.
                    // But if user closes it, we shouldn't show it again immediately?
                    // For now, force user to act.
                    setShowRenewalModal(true);
                }
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [token, showRenewalModal]);

    const handleLogout = () => {
        clearTokenCookies();
        router.push(`${getProxyBaseUrl()}/ui/login`);
    };

    const handleRenew = async () => {
        setIsRenewing(true);
        try {
            const response = await fetch(`${getProxyBaseUrl()}/refresh_token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}` // Send old token just in case, though cookie is primary
                },
            });

            if (response.ok) {
                message.success("Session renewed successfully");
                setShowRenewalModal(false);
                // Reload page to pick up new cookie in useAuthorized hooks
                window.location.reload();
            } else {
                const errorData = await response.json().catch(() => ({}));
                message.error(`Failed to renew session: ${errorData.detail || "Unknown error"}`);
                // If renewal fails (e.g. invalid JTI), we should probably logout
                handleLogout();
            }
        } catch (error) {
            console.error("Renewal error:", error);
            message.error("Failed to renew session due to network error");
        } finally {
            setIsRenewing(false);
        }
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
            <div className="flex items-center text-gray-500 mr-4 font-mono text-sm border border-gray-200 rounded px-2 py-1 bg-gray-50">
                Expires in: {formatTime(timeRemaining)}
            </div>

            <Modal
                title="Session Expiring"
                open={showRenewalModal}
                onCancel={handleLogout} // Closing modal logs out to enforce security? Or just dismisses? Prompt says "Renewal popup". Usually blocking.
                // Let's make it closable but it will disappear only if valid?
                // Actually if I close it, the timer continues and will eventually logout.
                // Let's allow close.
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
