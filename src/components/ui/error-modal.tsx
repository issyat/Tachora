import { Modal } from "./modal";

interface ErrorModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  suggestion?: string;
}

export function ErrorModal({ open, onClose, title, message, suggestion }: ErrorModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} widthClass="max-w-md" zIndexClass="z-60">
      <div className="space-y-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FF8057]/15 text-[#FF8057]">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3m0 4h.01M4.26 19h15.48c1.54 0 2.5-1.69 1.72-3.02L13.72 4.98c-.77-1.3-2.67-1.3-3.44 0L2.54 15.98C1.76 17.31 2.72 19 4.26 19z" />
            </svg>
          </div>
          <div className="space-y-2 text-sm leading-relaxed text-slate-700">
            <p className="font-medium text-slate-900">{message}</p>
            {suggestion && <p className="text-slate-600">{suggestion}</p>}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full bg-[#04ADBF] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0394a4] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30"
          >
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}
