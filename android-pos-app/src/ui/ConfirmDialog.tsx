import type { ReactNode } from "react";

export function ConfirmDialog(props: { open: boolean; title: string; children: ReactNode; confirmLabel: string; destructive?: boolean; disabled?: boolean; onConfirm: () => void; onClose: () => void }) {
  if (!props.open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section className="dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{props.title}</h2>
        <div className="dialog-content">{props.children}</div>
        <div className="dialog-actions">
          <button className="button ghost" onClick={props.onClose}>Cancel</button>
          <button className={`button ${props.destructive ? "danger" : "primary"}`} disabled={props.disabled} onClick={props.onConfirm}>{props.confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
