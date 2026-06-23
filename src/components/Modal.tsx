import { ReactNode, useEffect, useState } from "react";

// Univerzalni modalni okno. WKWebView v Tauri nepodporuje window.prompt(),
// proto vsechny vstupni dialogy resime takto.

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 480,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="ghost" onClick={onClose} title="Zavřít (Esc)">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Globalni potvrzovaci dialog (nahrada za window.confirm v destruktivnich akcich) ----

type ConfirmOpts = { title: string; message?: string; confirmLabel?: string; danger?: boolean };
let opener: ((o: ConfirmOpts) => Promise<boolean>) | null = null;

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  if (!opener) return Promise.resolve(window.confirm(opts.title));
  return opener(opts);
}

export function ConfirmHost() {
  const [state, setState] = useState<{ opts: ConfirmOpts; resolve: (v: boolean) => void } | null>(
    null
  );

  useEffect(() => {
    opener = (opts) => new Promise<boolean>((resolve) => setState({ opts, resolve }));
    return () => {
      opener = null;
    };
  }, []);

  if (!state) return null;
  const { opts, resolve } = state;
  const close = (v: boolean) => {
    resolve(v);
    setState(null);
  };

  return (
    <Modal
      title={opts.title}
      width={400}
      onClose={() => close(false)}
      footer={
        <>
          <button className="ghost" onClick={() => close(false)}>
            Zrušit
          </button>
          <button className={opts.danger ? "danger" : "primary"} onClick={() => close(true)}>
            {opts.confirmLabel || "Potvrdit"}
          </button>
        </>
      }
    >
      {opts.message && <div className="muted">{opts.message}</div>}
    </Modal>
  );
}
