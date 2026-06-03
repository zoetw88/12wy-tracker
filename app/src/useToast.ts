import { useState, useRef, useCallback } from "react";

export const TOAST_MS = 2400;

export function useToast() {
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), TOAST_MS);
  }, []);
  return { toast, notify };
}
