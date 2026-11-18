"use client";

import { useEffect, useRef, useState } from "react";
import { beep } from "@/_shared/beep";
import { Button } from "./ui";

// "Scan with camera" for phones and tablets without a barcode scanner.
// Reads the QR code or the barcode on our tags (both hold the Item / Combo
// Code) and hands the code to onCode. A USB scanner needs none of this: it
// types into the normal input like a keyboard.
export default function CameraScan({ onCode, label = "Camera", continuous = false, className }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)} className={className} title="Scan a tag with the camera">
        <span aria-hidden>📷</span> {label}
      </Button>
      {open && <Scanner onClose={() => setOpen(false)} onCode={onCode} continuous={continuous} />}
    </>
  );
}

function Scanner({ onCode, onClose, continuous }) {
  const video = useRef(null);
  const [error, setError] = useState(null);
  const [last, setLast] = useState(null);

  useEffect(() => {
    let controls;
    let stopped = false;
    let lastCode = null;
    let lastAt = 0;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video.current,
          (result) => {
            if (!result || stopped) return;
            const code = result.getText().trim().toUpperCase();
            const now = Date.now();
            if (code === lastCode && now - lastAt < 2500) return; // same tag still in view
            lastCode = code;
            lastAt = now;
            setLast(code);
            if (navigator.vibrate) navigator.vibrate(60);
            beep(true);
            onCode(code);
            if (!continuous) {
              stopped = true;
              controls?.stop();
              onClose();
            }
          },
        );
        if (stopped) controls.stop();
      } catch (e) {
        setError(
          e?.name === "NotAllowedError"
            ? "Camera permission was refused. Allow the camera for this site and try again."
            : e?.name === "NotFoundError" || e?.name === "OverconstrainedError"
              ? "No camera found on this device."
              : "The camera couldn't start. On a phone, open the app over https.",
        );
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label="Scan with camera">
      <div className="w-full max-w-md rounded-2xl bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Point the camera at a tag</h2>
          <Button variant="ghost" onClick={onClose}>{continuous ? "Done" : "Close"}</Button>
        </div>
        {error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80" />
          </div>
        )}
        <p className="mt-2 text-xs text-muted">
          {last ? <>Read <b className="font-mono">{last}</b>{continuous ? " — keep scanning." : ""}</> : "Reads the QR code or the barcode on our tags."}
        </p>
      </div>
    </div>
  );
}
