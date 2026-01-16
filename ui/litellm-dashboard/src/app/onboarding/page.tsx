"use client";
import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Title, Text, TextInput, Callout, Button, Grid, Col } from "@tremor/react";
import { RiCheckboxCircleLine } from "@remixicon/react";
import {
  getOnboardingCredentials,
  claimOnboardingToken,
  getUiConfig,
  getProxyBaseUrl,
  NotificationsManager,
} from "@/components/networking";
import { jwtDecode } from "jwt-decode";
import { Form, Button as Button2 } from "antd";
import { getCookie } from "@/utils/cookieUtils";

export default function Onboarding() {
  const [form] = Form.useForm();
  const searchParams = useSearchParams()!;
  const token = getCookie("token");
  const inviteID = searchParams.get("invitation_id");
  const action = searchParams.get("action");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [defaultUserEmail, setDefaultUserEmail] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userID, setUserID] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState<string>("");
  const [jwtToken, setJwtToken] = useState<string>("");
  const [getUiConfigLoading, setGetUiConfigLoading] = useState<boolean>(true);

  // Error State for Invalid Link
  const [errorState, setErrorState] = useState<{ isError: boolean; message: string }>({
    isError: false,
    message: "",
  });

  useEffect(() => {
    getUiConfig().then((data) => {
      // get the information for constructing the proxy base url, and then set the token and auth loading
      console.log("ui config in onboarding.tsx:", data);
      setGetUiConfigLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!inviteID || getUiConfigLoading) {
      // wait for the ui config to be loaded
      return;
    }

    getOnboardingCredentials(inviteID)
      .then((data) => {
        const login_url = data.login_url;
        console.log("login_url:", login_url);
        setLoginUrl(login_url);

        const token = data.token;
        const decoded = jwtDecode(token) as { [key: string]: any };
        setJwtToken(token);

        console.log("decoded:", decoded);
        setAccessToken(decoded.key);

        console.log("decoded user email:", decoded.user_email);
        const user_email = decoded.user_email;
        setUserEmail(user_email);

        const user_id = decoded.user_id;
        setUserID(user_id);
      })
      .catch((error) => {
        console.error("Failed to get onboarding credentials:", error);
        setErrorState({
          isError: true,
          message: error.message || "Invalid or Expired Invitation Link",
        });
      });
  }, [inviteID, getUiConfigLoading]);

  const handleSubmit = (formValues: Record<string, any>) => {
    console.log("in handle submit. accessToken:", accessToken, "token:", jwtToken, "formValues:", formValues);
    if (!accessToken || !jwtToken) {
      return;
    }

    formValues.user_email = userEmail;

    if (!userID || !inviteID) {
      return;
    }
    claimOnboardingToken(accessToken, inviteID, userID, formValues.password)
      .then(() => {
        const proxyBaseUrl = getProxyBaseUrl();
        console.log("proxyBaseUrl:", proxyBaseUrl);

        // Construct the full redirect URL using the proxyBaseUrl which includes the server root path
        // Redirect to login page so user can login with their new password
        let redirectUrl = proxyBaseUrl ? `${proxyBaseUrl}/ui` : "/ui";
        console.log("redirecting to:", redirectUrl);

        window.location.href = redirectUrl;
      })
      .catch((error) => {
        console.error("Claim token failed:", error);
        NotificationsManager.fromBackend(error);
      });

    // redirect to login page
  };

  if (errorState.isError) {
    return (
      <div className="mx-auto w-full max-w-md mt-10">
        <Card>
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <Title className="text-xl text-red-600 mb-2">Access Denied</Title>
            <Text className="text-gray-500 mb-6 text-sm">
              이 초대 링크는 일회성이며 이미 사용되었거나 만료되었습니다.<br />
              관리자에게 문의하여 새로운 초대 링크를 요청해 주세요.
            </Text>
            <Button2 type="primary" onClick={() => window.location.href = "/ui/login"}>
              Go to Login
            </Button2>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md mt-10">
      <Card>
        <Title className="text-sm mb-5 text-center">🚅 LiteLLM</Title>
        <Title className="text-xl">{action === "reset_password" ? "Reset Password" : "Sign up"}</Title>
        <Text>
          {action === "reset_password"
            ? "Reset your password to access Admin UI."
            : "Claim your user account to login to Admin UI."}
        </Text>

        {action !== "reset_password" && (
          <Callout className="mt-4" title="SSO" icon={RiCheckboxCircleLine} color="sky">
            <Grid numItems={2} className="flex justify-between items-center">
              <Col>SSO is under the Enterprise Tier.</Col>

              <Col>
                <Button variant="primary" className="mb-2">
                  <a href="https://forms.gle/W3U4PZpJGFHWtHyA9" target="_blank">
                    Get Free Trial
                  </a>
                </Button>
              </Col>
            </Grid>
          </Callout>
        )}

        <Form className="mt-10 mb-5 mx-auto" layout="vertical" onFinish={handleSubmit}>
          <>
            <Form.Item label="Email Address" name="user_email">
              <TextInput type="email" disabled={true} value={userEmail} defaultValue={userEmail} className="max-w-md" />
            </Form.Item>

            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: "password required to sign up" }]}
              help={action === "reset_password" ? "Enter your new password" : "Create a password for your account"}
            >
              <TextInput placeholder="" type="password" className="max-w-md" />
            </Form.Item>
          </>

          <div className="mt-10">
            <Button2 htmlType="submit">{action === "reset_password" ? "Reset Password" : "Sign Up"}</Button2>
          </div>
        </Form>
      </Card>
    </div>
  );
}
