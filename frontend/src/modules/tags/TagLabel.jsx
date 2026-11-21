"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { grams } from "@/modules/inventory/inventoryService";
import { LABEL_SIZES } from "./tagService";

// The QR code and the barcode both hold only the code (CH0001 / CB0001), so
// any scanner reads back the same text staff would type.
function Barcode({ value }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, { format: "CODE128", displayValue: false, margin: 0, height: 40, width: 2 });
    // Stretch to the box: bar widths scale evenly, so it stays readable.
    const svg = ref.current;
    const w = svg.getAttribute("width");
    const h = svg.getAttribute("height");
    svg.setAttribute("viewBox", `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
  }, [value]);
  return <svg ref={ref} aria-label={`Barcode ${value}`} role="img" />;
}

function Qr({ value }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [value]);
  // svg is generated locally by the qrcode library from our own code string.
  return <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={`QR ${value}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

// One face of a tag: QR, code, a title line, an extra line, weights, barcode.
function Face({ code, title, extra, purity, gross, stone, net, small, w, h, corner, date }) {
  return (
    <div
      className="relative flex flex-col overflow-hidden bg-white text-black"
      style={{ width: `${w}mm`, height: `${h}mm`, padding: small ? "1.5mm" : "2.5mm", gap: small ? "1mm" : "1.5mm" }}
    >
      {corner && (
        <span className="absolute right-[1mm] top-[0.6mm] font-bold uppercase tracking-wide" style={{ fontSize: small ? "1.8mm" : "2.4mm" }}>
          {corner}
        </span>
      )}
      <div className="flex min-h-0 flex-1" style={{ gap: small ? "1.5mm" : "2.5mm" }}>
        <div className="shrink-0" style={{ width: small ? "14mm" : "22mm", height: small ? "14mm" : "22mm" }}>
          <Qr value={code} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between leading-tight">
          <div className="min-w-0">
            <div className="font-mono font-bold" style={{ fontSize: small ? "3.4mm" : "5mm" }}>{code}</div>
            <div className="truncate" style={{ fontSize: small ? "2.3mm" : "3.2mm" }}>{title}</div>
            {extra && <div className="truncate font-mono" style={{ fontSize: small ? "2.1mm" : "2.6mm" }}>{extra}</div>}
          </div>
          <div className="flex items-baseline justify-between gap-1 tabular-nums" style={{ fontSize: small ? "2.2mm" : "3mm" }}>
            <span>
              <span className="font-semibold">{purity}</span>
              {" · "}G {grams(gross)}
              {stone > 0 && !small && <> · L {grams(stone)}</>}
              {" · "}N {grams(net)}
            </span>
            {/* Print date: when an old and a new tag get mixed up, the newer one is easy to spot. */}
            {date && <span className="shrink-0 opacity-70" style={{ fontSize: small ? "1.8mm" : "2.3mm" }}>{date}</span>}
          </div>
        </div>
      </div>
      <div className="shrink-0" style={{ height: small ? "5mm" : "8mm" }}>
        <Barcode value={code} />
      </div>
    </div>
  );
}

// style "single": one face. style "fold": a fold-over tag for a piece - its own
// tag on the front, and the combo it belongs to on the back, side by side on one
// label with a fold line between. A piece not in a combo gets a plain back.
export default function TagLabel({ label, size = "small", style = "single", backText }) {
  const { w, h } = LABEL_SIZES[size];
  const small = size === "small";
  const combo = label.kind === "COMBO";
  const now = new Date();
  const date = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;

  const front = (
    <Face
      small={small} w={w} h={h} code={label.code} title={label.title}
      corner={style === "fold" && !combo ? "Front" : null}
      extra={combo ? (!small ? label.piece_codes.join(" + ") : null) : label.huid ? `HUID ${label.huid}` : null}
      purity={label.purity} gross={label.gross_weight} stone={label.stone_weight} net={label.net_weight} date={date}
    />
  );
  if (style !== "fold" || combo) return <div className="tag-label" style={{ width: `${w}mm`, height: `${h}mm` }}>{front}</div>;

  const b = label.back;
  return (
    <div className="tag-label flex" style={{ width: `${w * 2}mm`, height: `${h}mm` }}>
      {front}
      <div className="h-full border-l border-dashed border-black/50" aria-hidden />
      {b ? (
        <Face
          small={small} w={w} h={h} code={b.code} title={b.title} corner="Combo"
          extra={`with ${b.piece_codes.filter((c) => c !== label.code).join(" + ")}`}
          purity={b.purity} gross={b.gross_weight} stone={0} net={b.net_weight} date={date}
        />
      ) : (
        <div className="flex flex-col items-center justify-center bg-white text-center text-black" style={{ width: `${w}mm`, height: `${h}mm` }}>
          <span className="font-semibold" style={{ fontSize: small ? "2.6mm" : "3.6mm" }}>{backText || ""}</span>
          <span className="font-mono" style={{ fontSize: small ? "2.2mm" : "3mm" }}>{label.code}</span>
        </div>
      )}
    </div>
  );
}
