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
    <Modal open={open} onClose={onClose} title={title} widthClass="max-w-md">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-900">{message}</p>
            {suggestion && (
              <p className="mt-2 text-sm text-slate-600">{suggestion}</p>
            )}
          </div>
        </div>
        
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}