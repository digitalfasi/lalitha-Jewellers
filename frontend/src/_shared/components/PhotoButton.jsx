"use client";

import { useRef, useState } from "react";
import { Button } from "./ui";

// Pick or take a photo (on a phone, "capture" opens the camera) and upload it.
export default function PhotoButton({ hasPhoto, onUpload, onRemove, onError, label }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(file);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex gap-3">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={pick} />
      <Button type="button" variant="link" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? "Uploading…" : label || (hasPhoto ? "Change photo" : "Add photo")}
      </Button>
      {hasPhoto && onRemove && (
        <Button type="button" variant="link" className="text-muted" onClick={() => onRemove().catch((e) => onError?.(e.message))}>
          Remove photo
        </Button>
      )}
    </span>
  );
}
