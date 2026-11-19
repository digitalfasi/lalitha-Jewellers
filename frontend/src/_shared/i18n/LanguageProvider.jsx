"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { TA } from "./ta";

// Tamil / English. Text is written in English in the code and wrapped in t():
//   const { t } = useT();  t("Add stock")  t("{n} tags waiting", { n: 3 })
// With Tamil on, t() returns the Tamil from ta.js, or the English if a line
// has no Tamil yet - so nothing ever shows blank. The choice is kept per device.
const KEY = "ui.lang";
const LanguageContext = createContext({ lang: "en", setLang: () => {}, t: (s) => s });

const fill = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)) : text);

export function useT() {
  return useContext(LanguageContext);
}

export default function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "ta" || saved === "en") setLangState(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  };

  const t = useCallback((text, vars) => fill(lang === "ta" ? TA[text] || text : text, vars), [lang]);

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function LanguageSwitch({ className = "" }) {
  const { lang, setLang } = useT();
  return (
    <div className={`flex overflow-hidden rounded-lg border border-line text-sm ${className}`} role="group" aria-label="Language">
      {[["en", "EN"], ["ta", "தமிழ்"]].map(([l, label]) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`px-2.5 py-1 ${lang === l ? "bg-accent text-white" : "bg-surface text-muted hover:text-ink"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
