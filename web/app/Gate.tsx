"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setKey, checkKey } from "@/lib/api";
import styles from "./Gate.module.css";

// The gate stores the key via lib/api (sessionStorage, key "rk") and reveals the
// console. It verifies the key first: storing an unchecked key produces a
// convincing console that 401s on the first real request.
export default function Gate() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function enter() {
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      if (!(await checkKey(value))) {
        setError("That password is not right.");
        setBusy(false);
        return;
      }
    } catch {
      setError("Could not reach the server. It may be down.");
      setBusy(false);
      return;
    }
    setKey(value);
    router.push("/studio");
  }

  return (
    <div className={styles.gate}>
      <h2 className={styles.heading} data-enter-item>Studio access</h2>
      <p className={styles.body} data-enter-item>
        The tool itself is password protected. The writeup above is the part that is public.
      </p>

      <div className={styles.field} data-enter-item>
        <label className={styles.label} htmlFor="gate-password">
          Password
        </label>
        <div className={styles.row}>
          <input
            id="gate-password"
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") enter();
            }}
          />
          <button type="button" className={styles.btn} onClick={enter} disabled={!value || busy}>
            {busy ? "Checking" : "Enter"}
          </button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>

      <p className={styles.footer} data-enter-item>Built by Brian Liew.</p>
    </div>
  );
}
