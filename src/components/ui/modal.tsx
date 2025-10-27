"use client";

import { useEffect } from "react";

type ModalProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  widthClass?: string;
};

export function Modal({ open, title, onClose, children, widthClass = "max-w-lg" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-4 pt-8">
        <div className={`w-full ${widthClass} rounded-2xl bg-white p-6 shadow-xl`}>
          <div className="flex items-start justify-between gap-4">
            {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
            <button onClick={onClose} aria-label="Close" className="-m-1 rounded p-1 text-slate-500 hover:bg-slate-100">✕</button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
