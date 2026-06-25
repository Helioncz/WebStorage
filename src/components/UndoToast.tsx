import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";

// Plovoucí "Vrátit" okno po smazání. Po 10 s akci potvrdí (commit),
// kliknutím na Vrátit ji zruší a obnoví (restore).
const SECONDS = 10;

export default function UndoToast() {
  const { undo, clearUndo, refresh } = useStore();
  const [left, setLeft] = useState(SECONDS);
  const committed = useRef(false);

  useEffect(() => {
    if (!undo) return;
    committed.current = false;
    setLeft(SECONDS);
    const tick = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    const timer = setTimeout(async () => {
      committed.current = true;
      try {
        await undo.commit();
      } finally {
        clearUndo();
      }
    }, SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [undo]);

  if (!undo) return null;

  const onUndo = async () => {
    if (committed.current) return;
    committed.current = true;
    try {
      await undo.restore();
      refresh();
    } finally {
      clearUndo();
    }
  };

  return (
    <div className="undo-toast">
      <span className="undo-msg">{undo.message}</span>
      <button className="undo-btn" onClick={onUndo}>
        Vrátit ({left}s)
      </button>
    </div>
  );
}
