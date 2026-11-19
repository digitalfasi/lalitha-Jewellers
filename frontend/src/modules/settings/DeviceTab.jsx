"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Notice, Select } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { BAUD_RATES, getScalePrefs, readScale, scaleSupported, setScalePrefs } from "@/_shared/scale";
import { LABEL_SIZES, TAG_STYLES, getTagPrefs, setTagPrefs } from "@/modules/tags/tagService";

// Settings for THIS computer only: the weighing scale and the tag printer layout.
export default function DeviceTab() {
  const { t } = useT();
  const [scale, setScale] = useState({ baud: 9600 });
  const [tags, setTags] = useState({ size: "small", layout: "sheet", style: "fold" });
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setScale(getScalePrefs());
    setTags(getTagPrefs());
  }, []);

  const saveScale = (p) => {
    setScale(p);
    setScalePrefs(p);
  };
  const saveTags = (p) => {
    setTags(p);
    setTagPrefs(p);
  };

  const test = async () => {
    setMsg(null);
    try {
      setMsg({ tone: "ok", text: t("The scale reads {g} g.", { g: await readScale() }) });
    } catch (e) {
      if (e?.name !== "NotFoundError") setMsg({ tone: "error", text: e.message });
    }
  };

  return (
    <div className="grid max-w-4xl gap-5 md:grid-cols-2">
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-semibold">{t("Weighing scale")}</h2>
        {scaleSupported() ? (
          <>
            <p className="text-sm text-muted">{t("Plug the scale into this computer with its USB or serial cable. The first time, the browser asks which device is the scale.")}</p>
            <Field label={t("Speed (baud rate)")} hint={t("In the scale's manual. 9600 is the most common.")}>
              <Select value={scale.baud} onChange={(e) => saveScale({ ...scale, baud: Number(e.target.value) })}>
                {BAUD_RATES.map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            </Field>
            <Button onClick={test} className="self-start">{t("Test: read the scale")}</Button>
            {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
          </>
        ) : (
          <p className="text-sm text-muted">{t("Reading the scale works in Chrome or Edge on a computer. On this browser, type the weights.")}</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-semibold">{t("Tag printing")}</h2>
        <Field label={t("Tag style")}>
          <Select value={tags.style} onChange={(e) => saveTags({ ...tags, style: e.target.value })}>
            {Object.entries(TAG_STYLES).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </Select>
        </Field>
        <Field label={t("Label size")}>
          <Select value={tags.size} onChange={(e) => saveTags({ ...tags, size: e.target.value })}>
            {Object.entries(LABEL_SIZES).map(([k, s]) => <option key={k} value={k}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label={t("Printer")}>
          <Select value={tags.layout} onChange={(e) => saveTags({ ...tags, layout: e.target.value })}>
            <option value="sheet">{t("A4 sheet")}</option>
            <option value="roll">{t("Label printer")}</option>
          </Select>
        </Field>
        <p className="text-xs text-muted">{t("These settings are saved on this computer only.")}</p>
      </Card>
    </div>
  );
}
