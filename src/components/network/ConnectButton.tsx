"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  removeConnectionAction,
  respondToConnectionRequestAction,
  sendConnectionRequestAction,
} from "@/app/(app)/network/actions";
import { useSignInPrompt } from "@/components/sign-in-prompt-provider";
import { useToast } from "@/components/toast-provider";
import type { ConnectionState } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

// Real request/accept connections (see network/actions.ts) — a `null`
// connectionState means no relation exists yet; otherwise the button
// reflects whichever of the 3 real states applies: a request the viewer
// sent (pending, cancelable), one they received (pending, accept/decline),
// or an accepted connection.
export function ConnectButton({
  memberId,
  memberName,
  viewer,
  connectionState,
  onChange,
  showMessage = true,
}: {
  memberId: string;
  memberName: string;
  viewer: Viewer | null;
  connectionState: ConnectionState | null;
  onChange?: (next: ConnectionState | null) => void;
  showMessage?: boolean;
}) {
  const router = useRouter();
  const showToast = useToast();
  const promptSignIn = useSignInPrompt();
  const [state, setState] = useState(connectionState);
  const [pending, setPending] = useState(false);

  function update(next: ConnectionState | null) {
    setState(next);
    onChange?.(next);
  }

  if (state?.status === "pending" && !state.requestedByMe) {
    return (
      <>
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const result = await respondToConnectionRequestAction(state.connectionId, true);
            setPending(false);
            if (result.error) {
              showToast(result.error);
              return;
            }
            update({ connectionId: state.connectionId, status: "accepted", requestedByMe: false });
            showToast(`You're now connected with ${memberName}`);
          }}
        >
          Accept
        </button>
        <button
          className="btn btn-outline"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const result = await respondToConnectionRequestAction(state.connectionId, false);
            setPending(false);
            if (result.error) {
              showToast(result.error);
              return;
            }
            update(null);
            showToast("Request declined");
          }}
        >
          Decline
        </button>
      </>
    );
  }

  const label =
    state?.status === "accepted" ? "Connected" : state?.status === "pending" ? "Pending" : "Connect";

  return (
    <>
      <button
        className={`btn${state ? " btn-accent" : " btn-primary"}`}
        disabled={pending}
        onClick={async () => {
          if (!viewer) {
            promptSignIn({ message: `Sign in or create a free account to connect with ${memberName}.` });
            return;
          }
          setPending(true);
          if (!state) {
            const result = await sendConnectionRequestAction(memberId);
            setPending(false);
            if (result.error) {
              showToast(result.error);
              return;
            }
            update({ connectionId: result.connectionId ?? "", status: "pending", requestedByMe: true });
            showToast("Connection request sent");
            return;
          }
          const wasAccepted = state.status === "accepted";
          const result = await removeConnectionAction(state.connectionId);
          setPending(false);
          if (result.error) {
            showToast(result.error);
            return;
          }
          update(null);
          showToast(wasAccepted ? "Connection removed" : "Request canceled");
        }}
      >
        {label === "Connect" ? (
          <>
            <span>Connect</span>
            <span aria-hidden="true" className="connect-button-plus">+</span>
          </>
        ) : label}
      </button>
      {showMessage && (
        <button
          className="btn btn-outline"
          onClick={() => {
            if (!viewer) {
              promptSignIn({ message: `Sign in or create a free account to message ${memberName}.` });
              return;
            }
            router.push(`/messages?to=${memberId}`);
          }}
        >
          Message
        </button>
      )}
    </>
  );
}
