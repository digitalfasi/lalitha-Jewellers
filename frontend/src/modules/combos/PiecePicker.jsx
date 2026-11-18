"use client";

import { useEffect, useRef, useState } from "react";
import CameraScan from "@/_shared/components/CameraScan";
import { Input } from "@/_shared/components/ui";
import { grams } from "@/modules/inventory/inventoryService";
import { comboService } from "./comboService";

// Type or scan an Item Code. Offers only pieces that can join a combo now
// (in stock, not in another combo). Enter picks an exact code match, or the
// only match.
export default function PiecePicker({ onPick, exclude = [], placeholder = "Scan or type item code", autoFocus, disabled, categoryId }) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    const q = text.trim();
    const t = setTimeout(() => {
      comboService
        .availablePieces(q, 12, categoryId)
        .then((list) => {
          setOptions(list.filter((p) => !exclude.includes(p.item_code)));
          setActive(0);
        })
        .catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [text, exclude.join(","), categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A code read by the camera: pick it if it's free (and of the right category).
  const fromCamera = async (code) => {
    setError(null);
    try {
      const list = await comboService.availablePieces(code, 5, categoryId);
      const hit = list.find((p) => p.item_code === code && !exclude.includes(code));
      if (hit) pick(hit);
      else setError(`${code} is not available here — not found, not in stock, already chosen, or in another combo.`);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (p) => {
    setText("");
    setOpen(false);
    setError(null);
    onPick(p);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const code = text.trim().toUpperCase();
      if (!code) return;
      const exact = options.find((p) => p.item_code === code);
      if (exact) return pick(exact);
      if (open && options[active]) return pick(options[active]);
      if (options.length === 1) return pick(options[0]);
      if (exclude.includes(code)) return setError(`${code} is already in the list.`);
      setError(`${code} is not available — not found, not in stock, or already in a combo.`);
    }
  };

  return (
    <div ref={box} className="relative">
      <div className="flex gap-2">
      <Input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setError(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        className="font-mono"
        aria-label="Item code"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      <CameraScan onCode={fromCamera} label="" className="px-2.5" />
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      {open && options.length > 0 && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
          {options.map((p, i) => (
            <li
              key={p.piece_id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm ${i === active ? "bg-accent-soft" : ""}`}
            >
              <span>
                <span className="font-mono font-semibold">{p.item_code}</span>
                <span className="ml-2">{p.name}</span>
                <span className="ml-1 text-xs text-muted">· {p.category_name}</span>
              </span>
              <span className="tabular-nums text-xs text-muted">{grams(p.net_weight)} g</span>
            </li>
          ))}
        </ul>
      )}
      {open && options.length === 0 && text.trim() && !error && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted shadow-lg">
          No free piece matches.
        </div>
      )}
    </div>
  );
}
