"use client";

// Who is signed in. Deployed, that is a Cognito user; without Cognito settings
// (local development) everyone is a stand-in user the API also recognises.

import { createContext, useContext } from "react";
import { AuthProvider, useAuth } from "react-oidc-context";

export interface Session {
  loading: boolean;
  signedIn: boolean;
  email: string | null;
  token: string | null;
  error: string | null;
  signIn(): void;
  signOut(): void;
}

const authority = process.env.NEXT_PUBLIC_COGNITO_AUTHORITY;
const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
const configured = Boolean(authority && clientId && cognitoDomain);

const LOCAL: Session = {
  loading: false,
  signedIn: true,
  email: "local",
  token: null,
  error: null,
  signIn() {},
  signOut() {},
};

const SessionContext = createContext<Session>(LOCAL);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  if (!configured) return children;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <AuthProvider
      authority={authority}
      client_id={clientId}
      redirect_uri={`${origin}/`}
      response_type="code"
      scope="openid email profile"
      onSigninCallback={() => {
        // Drop ?code=&state= from the address bar once the sign-in has completed.
        window.history.replaceState({}, document.title, window.location.pathname);
      }}
    >
      <CognitoSession>{children}</CognitoSession>
    </AuthProvider>
  );
}

function CognitoSession({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const session: Session = {
    loading: auth.isLoading,
    signedIn: auth.isAuthenticated,
    email: auth.user?.profile.email ?? null,
    token: auth.user?.access_token ?? null,
    error: auth.error?.message ?? null,
    signIn: () => void auth.signinRedirect(),
    signOut: async () => {
      await auth.removeUser();
      const params = new URLSearchParams({
        client_id: clientId!,
        logout_uri: `${window.location.origin}/`,
      });
      // Cognito's hosted logout endpoint, which also ends the session on its side.
      window.location.href = new URL(`/logout?${params}`, cognitoDomain).toString();
    },
  };
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
