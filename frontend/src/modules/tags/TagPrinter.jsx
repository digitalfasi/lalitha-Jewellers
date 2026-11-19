"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import TagLabel from "./TagLabel";
import { getTagPrefs, pageRule, tagService } from "./tagService";

// Print tags from any screen without leaving it:
//   const { printTags, printer } = useTagPrinter();
//   printTags(["CH0001"]);  ...  {printer}
// The labels are printed with this browser's tag settings (Tags page), then a
// bar asks whether they came out fine; "Yes" records them as printed, so they
// leave the "Tags to print" list.
export function useTagPrinter() {
  const { t } = useT();
  const [job, setJob] = useState(null); // {labels, codes, prefs, stage: "printing" | "confirm" | "error", error}

  const printTags = useCallback(async (codes) => {
    const wanted = (codes || []).filter(Boolean);
    if (!wanted.length) return;
    const prefs = getTagPrefs();
    try {
      const { labels } = await tagService.labels(wanted, prefs.style === "fold");
      const printable = labels.filter((l) => l.printable);
      if (!printable.length) return setJob({ stage: "error", error: t("Nothing to print: these are sold or not in stock.") });
      setJob({ labels: printable, prefs, stage: "printing" });
    } catch (e) {
      setJob({ stage: "error", error: e.message });
    }
  }, [t]);

  // Print once the labels are on the page (QR codes draw asynchronously).
  useEffect(() => {
    if (job?.stage !== "printing") return;
    const t = setTimeout(() => {
      window.print(); // blocks until the print dialog closes
      setJob((j) => j && { ...j, stage: "confirm" });
    }, 400);
    return () => clearTimeout(t);
  }, [job?.stage]);

  const confirm = async () => {
    try {
      await tagService.markPrinted(job.labels.map((l) => l.code));
      setJob(null);
    } catch (e) {
      setJob({ ...job, stage: "error", error: e.message });
    }
  };

  const printer = job ? (
    <>
      {job.labels && typeof document !== "undefined" &&
        createPortal(
          <div className={`quick-print print-only ${job.prefs.layout === "roll" ? "print-roll" : "print-sheet"}`}>
            <style>{pageRule(job.prefs)}</style>
            {job.labels.map((l) => (
              <TagLabel key={l.code} label={l} size={job.prefs.size} style={job.prefs.style} />
            ))}
          </div>,
          document.body,
        )}
      {job.stage !== "printing" && (
        <div className="no-print fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[95vw] flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-xl" role="status">
          {job.stage === "error" ? (
            <>
              <span className="text-red-700">{job.error}</span>
              <Button variant="ghost" onClick={() => setJob(null)}>{t("Close")}</Button>
            </>
          ) : (
            <>
              <span>
                {t("Did the tags print OK?")}{" "}
                <b className="font-mono">{job.labels.map((l) => l.code).slice(0, 4).join(", ")}{job.labels.length > 4 ? "…" : ""}</b>
              </span>
              <Button onClick={confirm}>{t("Yes, they're on the pieces")}</Button>
              <Button variant="ghost" onClick={() => setJob({ ...job, stage: "printing" })}>{t("Print again")}</Button>
              <Button variant="link" className="text-muted" onClick={() => setJob(null)}>{t("Not now")}</Button>
            </>
          )}
        </div>
      )}
    </>
  ) : null;

  return { printTags, printer };
}
