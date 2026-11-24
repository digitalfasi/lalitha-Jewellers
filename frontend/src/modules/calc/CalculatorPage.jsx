"use client";

import { useT } from "@/_shared/i18n/LanguageProvider";
import { CalcWorkspace } from "./Calculator";

// The full calculator: every tool down the left, a wide work area, pinned formulas and the tape on the right.
export default function CalculatorPage() {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{t("Calculator")}</h1>
        <p className="hidden text-sm text-muted sm:block">{t("Quick sums, Excel-style formulas, a sheet and the gold tools in one place. F2 opens the quick calculator anywhere.")}</p>
      </div>
      <CalcWorkspace layout="page" />
    </div>
  );
}
