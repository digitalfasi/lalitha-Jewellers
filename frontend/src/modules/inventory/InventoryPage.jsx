"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Notice } from "@/_shared/components/ui";
import { inventoryService } from "./inventoryService";
import { tagService } from "@/modules/tags/tagService";
import CategoriesTab from "./CategoriesTab";
import DesignsTab from "./DesignsTab";
import LotsTab from "./LotsTab";
import PiecesTab from "./PiecesTab";

const TABS = [
  { id: "pieces", label: "Pieces" },
  { id: "lots", label: "Lots & karigars" },
  { id: "categories", label: "Categories" },
  { id: "designs", label: "Designs" },
];

export default function InventoryPage() {
  const [tab, setTab] = useState("pieces");
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [lot, setLot] = useState(null); // filter pieces to one lot
  const [pendingTags, setPendingTags] = useState(0);
  useEffect(() => {
    const load = () => tagService.pending().then((l) => setPendingTags(l.length)).catch(() => {});
    load();
    window.addEventListener("tags:changed", load);
    return () => window.removeEventListener("tags:changed", load);
  }, []);

  const loadCategories = useCallback(() => {
    inventoryService.listCategories().then(setCategories).catch((e) => setError(e.message));
  }, []);
  useEffect(loadCategories, [loadCategories]);

  // Remember the open tab for this browser tab (per-viewer convenience only).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("inventory.tab");
      if (saved && TABS.some((t) => t.id === saved)) setTab(saved);
    } catch {}
  }, []);
  const choose = (id) => {
    setTab(id);
    try {
      sessionStorage.setItem("inventory.tab", id);
    } catch {}
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted">Every piece gets its own Item Code from its category prefix.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {pendingTags > 0 && (
          <Link href="/tags" className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 hover:underline">
            {pendingTags} tag{pendingTags === 1 ? "" : "s"} to print
          </Link>
        )}
        <Link href="/inventory/bulk" className="text-sm font-medium text-accent hover:underline">Bulk entry / import →</Link>
        <nav className="flex rounded-xl border border-line bg-surface p-1" aria-label="Inventory sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => choose(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={clsx(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition",
                tab === t.id ? "bg-accent text-white" : "text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        </div>
      </div>

      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}

      {tab === "pieces" && <PiecesTab categories={categories} onChanged={loadCategories} lot={lot} onClearLot={() => setLot(null)} />}
      {tab === "lots" && <LotsTab onShowPieces={(l) => { setLot(l); choose("pieces"); }} />}
      {tab === "categories" && <CategoriesTab categories={categories} onChanged={loadCategories} />}
      {tab === "designs" && <DesignsTab categories={categories} />}
    </div>
  );
}
