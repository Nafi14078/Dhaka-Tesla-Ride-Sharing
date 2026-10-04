"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, string>) => void;
        };
      };
    };
  }
}

export function GoogleSignInButton({ onCredential, onError, disabled }: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  disabled: boolean;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef({ onCredential, onError, disabled });
  callbackRef.current = { onCredential, onError, disabled };

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      onError("Google sign-in is not configured yet. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to the frontend environment.");
      return;
    }

    const render = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => callbackRef.current.onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: "360",
      });
    };

    if (window.google) {
      render();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    const addedHere = !script;
    if (!script) {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    script.addEventListener("error", () => callbackRef.current.onError("Could not load Google sign-in. Check your connection and try again."));
    return () => {
      script?.removeEventListener("load", render);
      if (addedHere) script?.remove();
    };
    // Keep the rendered GIS button stable; callbacks are read from callbackRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={buttonRef} aria-disabled={disabled} style={disabled ? { opacity: 0.55, pointerEvents: "none" } : undefined} />;
}
