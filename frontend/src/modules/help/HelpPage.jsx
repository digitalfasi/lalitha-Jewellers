"use client";

import { FEATURES } from "@/_shared/features";
import Link from "next/link";
import { Link2, PackagePlus, Printer, Receipt, ScanLine, Tag, Undo2 } from "lucide-react";
import { useT } from "@/_shared/i18n/LanguageProvider";

// Step-by-step guides for the everyday jobs, in plain words. Printable as
// one-page counter guides (each guide keeps to one page when printed).
const GUIDES = [
  {
    id: "stock", icon: PackagePlus, title: "Add new stock", link: "/inventory",
    steps: [
      "Open Stock.",
      "Choose One piece, or A combo if the pieces come together (chain + pendant).",
      "Choose the category and the design. The name and touch fill in by themselves.",
      "Tap the purity, then put the piece on the scale and press Scale (or type the gross weight).",
      "Type the HUID if the piece has one.",
      "Press Save. The tag prints. Tie it on the piece.",
      "When the printer asks \"Did the tags print OK?\", press Yes.",
    ],
  },
  {
    id: "set", icon: Link2, title: "Make a combo from stock", link: "/inventory?pick=1",
    steps: [
      "Open Stock.",
      "Tick the box next to each piece of the combo (for example a chain and a pendant).",
      "Press Make a combo at the top.",
      "New tags print: the piece on the front, the combo on the back. Fold them on the dashed line and tie them on.",
    ],
  },
  {
    id: "bill", icon: Receipt, title: "Make a bill", link: "/billing/new",
    steps: [
      "Open Billing and press New bill.",
      "Step 1: tap the shop.",
      "Step 2: scan each tag. Scanning one piece of a combo adds the whole combo.",
      "To bill a combo's pieces on separate lines, press Split.",
      "Type the charges for each line if there are any.",
      "Step 3: check the total and press Save bill.",
      "On the bill, press Print, Download PDF or WhatsApp.",
    ],
  },
  {
    id: "tags", icon: Tag, title: "Print tags that are waiting", link: "/tags",
    steps: [
      "Open Tags. The yellow box shows how many tags are waiting.",
      "Press Add all to the queue, then Print.",
      "Tie each tag on its piece, then press Yes, mark them as tagged.",
    ],
  },
  {
    id: "count", icon: ScanLine, title: "Count the stock", link: "/audit",
    steps: [
      "Open Stock count and press Start counting.",
      "Scan every tag on the shelves. A beep means it counted.",
      "The Missing list shows pieces that should be there but weren't scanned. Look for them.",
      "A manager presses Finish count when done.",
    ],
  },
  {
    id: "undo", icon: Undo2, title: "If you made a mistake", link: null,
    steps: [
      "Removed a line from a bill by mistake: press Undo straight away.",
      "Took a piece out of a combo by mistake: press Undo on the combo's page.",
      "Wrong weight on a piece: open Stock, press Edit on the piece, fix it, save, and print the tag again.",
      "A saved bill is wrong: ask a manager to cancel it. Everything goes back in stock, then make the bill again.",
    ],
  },
];

export default function HelpPage() {
  const { t } = useT();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Help")}</h1>
          <p className="text-sm text-muted">{t("How to do each job, step by step. Use the language switch at the top for Tamil.")}</p>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas">
          <Printer size={16} aria-hidden /> {t("Print these guides")}
        </button>
      </div>

      <nav className="no-print flex flex-wrap gap-2">
        {GUIDES.filter((g) => FEATURES.stockCount || g.id !== "count").map((g) => (
          <a key={g.id} href={`#${g.id}`} className="rounded-full border border-line bg-surface px-3 py-1 text-sm hover:border-accent">{t(g.title)}</a>
        ))}
      </nav>

      {GUIDES.filter((g) => FEATURES.stockCount || g.id !== "count").map(({ id, icon: Icon, title, link, steps }) => (
        <section key={id} id={id} className="break-inside-avoid rounded-2xl border border-line bg-surface p-5 print:break-after-page print:border-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Icon size={24} className="text-accent" aria-hidden /> {t(title)}
            </h2>
            {link && <Link href={link} className="no-print text-sm font-medium text-accent hover:underline">{t("Go there →")}</Link>}
          </div>
          <ol className="mt-3 flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={s} className="flex gap-3 text-base">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{t(s)}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
