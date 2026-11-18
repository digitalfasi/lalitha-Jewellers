"use client";

import { useEffect, useState } from "react";
import { api } from "@/_shared/api/client";

// Shows whether the backend (and its database) is reachable.
export default function HealthBadge() {
  const [state, setState] = useState({ tone: "wait", text: "Checking server…" });

  useEffect(() => {
    api("/health")
      .then((h) =>
        setState(
          h.database === "ok"
            ? { tone: "ok", text: `Server ok · v${h.version}` }
            : { tone: "bad", text: "Server up, database down" },
        ),
      )
      .catch((e) => setState({ tone: "bad", text: e.message }));
  }, []);

  const tones = {
    wait: "bg-line text-muted",
    ok: "bg-green-100 text-green-800",
    bad: "bg-red-100 text-red-800",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${tones[state.tone]}`}>{state.text}</span>;
}
