"use client";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
export function Drawer({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) {
      ref.current?.showModal();
    }
    if (!open) {
      ref.current?.close();
    }
  }, [open]);
  return (
    <dialog
      aria-label={title}
      className="drawer"
      onCancel={onClose}
      onClose={onClose}
      ref={ref}
    >
      <header>
        <div>
          <span className="eyebrow">SESSION DETAILS</span>
          <h2>{title}</h2>
        </div>
        <button
          aria-label={`Close ${title}`}
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          <X size={20} />
        </button>
      </header>
      <div className="drawer-body">{children}</div>
    </dialog>
  );
}
