"use client";

import React, { useEffect, useState } from "react";
import { Modal, Button, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { jwtDecode } from "jwt-decode";
import { useRouter } from "next/navigation";
import { getProxyBaseUrl } from "@/components/networking";
import { clearTokenCookies, setAuthToken } from "@/utils/cookieUtils";

interface TokenExpirationTimerProps {
    token: string | null;
}

const TokenExpirationTimer: React.FC<TokenExpirationTimerProps> = ({ token }) => {
    const router = useRouter();
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [showRenewalModal, setShowRenewalModal] = useState(false);
    const [isRenewing, setIsRenewing] = useState(false);

    // Manual renewal cooldown state
    const [renewCooldown, setRenewCooldown] = useState(false);

    // Determines when to show the popup (default 60s, but 10s if short lived)
    const [warningThreshold, setWarningThreshold] = useState(60000);

    useEffect(() => {
        if (!token) return;

        let expirationTime: number | null = null;
        try {
            const decoded: any = jwtDecode(token);
            console.log("TokenExpirationTimer: Decoded token", decoded);
            if (decoded.exp) {
                expirationTime = decoded.exp * 1000; // Convert to ms

                // Adaptive Threshold Logic
                if (decoded.iat) {
                    const iatTime = decoded.iat * 1000;
                    const totalDuration = expirationTime - iatTime;
                    // If total duration is small (<= 90 seconds to be safe), warn only 10s before
                    if (totalDuration <= 90000) {
                        setWarningThreshold(10000);
                    } else {
                        setWarningThreshold(60000);
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

        const interval = setInterval(() => {
            const now = Date.now();
            const diff = expirationTime! - now;

            if (diff <= 0) {
                clearInterval(interval);
                handleLogout();
            } else {
                setTimeRemaining(diff);

                // Show modal based on adaptive threshold
                if (diff < warningThreshold && !showRenewalModal) {
                    setShowRenewalModal(true);
                }
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [token, showRenewalModal, warningThreshold]);

    const handleLogout = async () => {
        await clearTokenCookies();
        router.push(`${getProxyBaseUrl()}/ui/login`);
    };

    const handleRenew = async () => {
        setIsRenewing(true);
        try {
            const response = await fetch(`${getProxyBaseUrl()}/refresh_token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
            });

            if (response.ok) {
                const data = await response.json();
                if (data.token) {
                    setAuthToken(data.token);
                }
                message.success("Session renewed successfully");
                setShowRenewalModal(false);

                // Activate Cooldown for Manual Button
                setRenewCooldown(true);
                setTimeout(() => {
                    setRenewCooldown(false);
                }, 10000); // 10 seconds cooldown

                // Reload page to pick up new cookie
                window.location.reload();
            } else {
                const errorData = await response.json().catch(() => ({}));
                message.error(`Failed to renew session: ${errorData.detail || "Unknown error"}`);
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
