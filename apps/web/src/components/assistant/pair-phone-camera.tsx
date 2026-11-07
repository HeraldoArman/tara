"use client";

import "./pair-phone-camera.css";

import { Button } from "@tara/ui/components/button";
import { Check, Copy, RefreshCw, Smartphone, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useState } from "react";
import { api, errorMessage } from "@/lib/api";

export interface PhoneCameraPairing {
  claimed: boolean;
  expiresAt: string;
  id: string;
  participantIdentity: string;
}
interface CreatedPairing extends Omit<PhoneCameraPairing, "claimed"> {
  token: string;
}

function PairingStatus({
  connected,
  claimed,
}: {
  connected: boolean;
  claimed: boolean;
}) {
  if (connected) {
    return (
      <p className="tara-phone-pairing-connected" role="status">
        <Check aria-hidden="true" />
        Phone camera connected
      </p>
    );
  }
  if (claimed) {
    return (
      <p role="status">
        Phone paired. Start the camera on your phone to see video here.
      </p>
    );
  }
  return (
    <p>
      Scan this QR code, open the link, and tap Start phone camera. The QR code
      expires in 10 minutes.
    </p>
  );
}

export function PairPhoneCamera({
  runId,
  disabled,
  pairing,
  phoneConnected,
  onPairingChange,
  onConnect,
  onUseLaptop,
}: {
  runId: string;
  disabled: boolean;
  pairing: PhoneCameraPairing | null;
  phoneConnected: boolean;
  onPairingChange: (pairing: PhoneCameraPairing | null) => Promise<unknown>;
  onConnect: () => Promise<unknown>;
  onUseLaptop: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(Boolean(pairing));
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const createPairing = useCallback(async () => {
    if (disabled || busy) {
      return;
    }
    setBusy(true);
    setOpen(true);
    setError("");
    setCopied(false);
    setLink("");
    try {
      const connection = await onConnect();
      if (connection === null || connection === false) {
        throw new Error("Connect the assistant before pairing a phone camera.");
      }
      const created = await api<CreatedPairing>(
        `/runs/${encodeURIComponent(runId)}/camera-pairing`,
        { method: "POST" }
      );
      setLink(
        `${window.location.origin}/pair-camera#${encodeURIComponent(created.id)}:${encodeURIComponent(created.token)}`
      );
      await onPairingChange({
        claimed: false,
        expiresAt: created.expiresAt,
        id: created.id,
        participantIdentity: created.participantIdentity,
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, onConnect, onPairingChange, runId]);

  const cancelPairing = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/runs/${encodeURIComponent(runId)}/camera-pairing`, {
        method: "DELETE",
      });
      setLink("");
      setOpen(false);
      await onPairingChange(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, [onPairingChange, runId]);
  const useLaptop = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const used = await onUseLaptop();
      if (used === false || used === null) {
        throw new Error(
          "The laptop camera did not start. Check camera permission and try again."
        );
      }
      setLink("");
      setOpen(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, [onUseLaptop]);
  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError(
        "The link could not be copied. Scan the QR code with your phone instead."
      );
    }
  }, [link]);

  return (
    <section aria-label="Phone camera pairing" className="tara-phone-pairing">
      <div className="tara-phone-pairing-heading">
        <div>
          <Smartphone aria-hidden="true" />
          <strong>Use your phone camera</strong>
        </div>
        <Button
          disabled={disabled || busy}
          onClick={createPairing}
          size="sm"
          variant="outline"
        >
          {busy ? "Connecting…" : "Pair phone camera"}
        </Button>
      </div>
      <p>
        Keep tara and your microphone on this laptop. Your phone supplies the
        work-area video.
      </p>
      {open || pairing ? (
        <div className="tara-phone-pairing-body">
          <PairingStatus
            claimed={Boolean(pairing?.claimed)}
            connected={phoneConnected}
          />
          {link && !pairing?.claimed ? (
            <div className="tara-phone-pairing-code">
              <QRCodeSVG
                level="M"
                marginSize={4}
                size={192}
                title="Pair your phone camera"
                value={link}
              />
              <Button onClick={copyLink} size="sm" variant="ghost">
                <Copy aria-hidden="true" />
                {copied ? "Link copied" : "Copy phone link"}
              </Button>
            </div>
          ) : null}
          {!link && pairing && !pairing.claimed ? (
            <p>
              The QR code is available only when it is created. Generate a new
              one to pair this phone.
            </p>
          ) : null}
          <div className="tara-phone-pairing-actions">
            <Button
              disabled={disabled || busy}
              onClick={createPairing}
              size="sm"
              variant="ghost"
            >
              <RefreshCw aria-hidden="true" />
              New QR code
            </Button>
            <Button
              disabled={disabled || busy}
              onClick={useLaptop}
              size="sm"
              variant="outline"
            >
              Use laptop camera
            </Button>
            <Button
              disabled={disabled || busy}
              onClick={cancelPairing}
              size="sm"
              variant="ghost"
            >
              <X aria-hidden="true" />
              End pairing
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="tara-phone-pairing-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
