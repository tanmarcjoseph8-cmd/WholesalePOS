import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, History, LockKeyhole, RefreshCw, Scale, X } from "lucide-react";
import { denominationTotal, phpDenominations, type CashSessionRecord, type DenominationCount } from "../../domain/cash-drawer";
import { createId, formatMoney } from "../../domain/models";
import { ConfirmDialog } from "../ConfirmDialog";
import { useOfflineApp } from "../app-context";

const today = () => new Date().toISOString().slice(0, 10);
const movementReasons = ["Petty cash", "Supplier payment", "Bank deposit", "Change fund", "Owner withdrawal", "Other"];

function sessionStatus(status: CashSessionRecord["status"]) {
  return status.replaceAll("_", " ").toLowerCase();
}

export function CashDrawerView() {
  const { app, user, revision, refresh, notify, setUnsaved } = useOfflineApp();
  const [current, setCurrent] = useState<CashSessionRecord | null>(null);
  const [history, setHistory] = useState<CashSessionRecord[]>([]);
  const [selected, setSelected] = useState<CashSessionRecord | null>(null);
  const [tab, setTab] = useState<"current" | "history">("current");
  const [openingCash, setOpeningCash] = useState(0);
  const [openingNotes, setOpeningNotes] = useState("");
  const [movementType, setMovementType] = useState<"CASH_IN" | "CASH_OUT" | null>(null);
  const [movementAmount, setMovementAmount] = useState(0);
  const [movementReason, setMovementReason] = useState(movementReasons[0]);
  const [movementNotes, setMovementNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const [manualActual, setManualActual] = useState(0);
  const [useCounter, setUseCounter] = useState(true);
  const [counts, setCounts] = useState<DenominationCount[]>(phpDenominations.map((item) => ({ ...item, quantity: 0 })));
  const [closingNotes, setClosingNotes] = useState("");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [status, setStatus] = useState("");
  const [reviewResolution, setReviewResolution] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestKey = useRef(createId("cashdrawer"));

  const canReview = user.permissions.includes("*") || user.permissions.includes("cash_drawer.review");
  const countedCash = denominationTotal(counts);
  const actualCash = useCounter ? countedCash : manualActual;
  const difference = actualCash - (current?.expectedCashCents ?? 0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [active, sessions] = await Promise.all([
        app.cashDrawer.current(user),
        app.cashDrawer.history(user, { fromDate, toDate, status: status || undefined })
      ]);
      setCurrent(active);
      setHistory(sessions);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Cash drawer data could not be loaded.", "error");
    } finally { setLoading(false); }
  }, [app, user, fromDate, toDate, status, notify]);

  useEffect(() => { void load(); }, [load, revision]);
  useEffect(() => { setUnsaved(openingCash > 0 || Boolean(openingNotes) || movementType !== null || closing); return () => setUnsaved(false); }, [openingCash, openingNotes, movementType, closing, setUnsaved]);

  async function openDrawer(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await app.cashDrawer.open(user, { requestKey: requestKey.current, openingCashCents: openingCash, notes: openingNotes });
      requestKey.current = createId("cashdrawer"); setOpeningCash(0); setOpeningNotes(""); refresh(); notify("Cash drawer opened.", "success");
    } catch (caught) { notify(caught instanceof Error ? caught.message : "Cash drawer could not be opened.", "error"); }
    finally { setBusy(false); }
  }

  async function saveMovement() {
    if (!movementType) return;
    setBusy(true);
    try {
      await app.cashDrawer.addMovement(user, { requestKey: requestKey.current, type: movementType, amountCents: movementAmount, reason: movementReason, notes: movementNotes });
      requestKey.current = createId("cashdrawer"); setMovementType(null); setMovementAmount(0); setMovementNotes(""); refresh(); notify(movementType === "CASH_IN" ? "Cash added." : "Cash removed.", "success");
    } catch (caught) { notify(caught instanceof Error ? caught.message : "Cash movement could not be saved.", "error"); }
    finally { setBusy(false); }
  }

  async function closeDrawer() {
    setBusy(true);
    try {
      const closed = await app.cashDrawer.close(user, { requestKey: requestKey.current, actualCashCents: actualCash, notes: closingNotes, denominations: useCounter ? counts : undefined });
      requestKey.current = createId("cashdrawer"); setClosing(false); setClosingNotes(""); setManualActual(0); setCounts(phpDenominations.map((item) => ({ ...item, quantity: 0 })));
      setSelected(closed); setTab("history"); refresh(); notify(closed.differenceCents === 0 ? "Cash drawer closed and balanced." : "Cash drawer closed with a difference for review.", closed.differenceCents === 0 ? "success" : "error");
    } catch (caught) { notify(caught instanceof Error ? caught.message : "Cash drawer could not be closed.", "error"); }
    finally { setBusy(false); }
  }

  async function reviewSession() {
    if (!selected) return;
    setBusy(true);
    try {
      const reviewed = await app.cashDrawer.review(user, { sessionId: selected.id, resolution: reviewResolution, notes: reviewNotes });
      setSelected(reviewed); setReviewResolution(""); setReviewNotes(""); refresh(); notify("Cash difference review saved.", "success");
    } catch (caught) { notify(caught instanceof Error ? caught.message : "Review could not be saved.", "error"); }
    finally { setBusy(false); }
  }

  const session = selected ?? current;
  const duration = session ? Math.max(0, Math.round(((session.closedAt ? new Date(session.closedAt) : new Date()).getTime() - new Date(session.openedAt).getTime()) / 60_000)) : 0;

  return <section className="page-stack cash-drawer-page">
    <header className="page-header"><div><h2>Cash Drawer</h2><p>Opening cash, physical cash movements, closing count, and permanent reconciliation history.</p></div><button className="button secondary" onClick={() => { refresh(); void load(); }}><RefreshCw size={18} /> Refresh</button></header>
    <div className="segmented cash-tabs"><button className={tab === "current" ? "active" : ""} onClick={() => { setSelected(null); setTab("current"); }}>Current drawer</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><History size={17} /> History</button></div>

    {loading ? <p className="loading"><RefreshCw className="spin" /> Loading cash drawer...</p> : null}
    {!loading && tab === "current" && !current ? <form className="data-panel drawer-open-panel" onSubmit={openDrawer}>
      <div className="drawer-empty-icon"><LockKeyhole size={28} /></div><div><h3>Open today&apos;s cash drawer</h3><p>Count the starting float before accepting cash payments.</p></div>
      <label>Opening cash<input type="number" min="0" step="0.01" value={openingCash / 100} onChange={(event) => setOpeningCash(Math.round(Number(event.target.value) * 100))} required /></label>
      <label>Opening notes<textarea value={openingNotes} onChange={(event) => setOpeningNotes(event.target.value)} placeholder="Optional count or handover note" /></label>
      <button className="button primary" disabled={busy}><Banknote size={18} /> {busy ? "Opening" : "Open drawer"}</button>
    </form> : null}

    {!loading && tab === "current" && current ? <>
      <div className="drawer-status-band"><div><span className="status-label normal">Open</span><strong>{current.openedByName}</strong><small>{current.businessDate} | opened {new Date(current.openedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</small></div><button className="button danger" onClick={() => { setManualActual(current.expectedCashCents); setClosing(true); }}><LockKeyhole size={18} /> Close drawer</button></div>
      <div className="report-metrics drawer-metrics"><article><span>Expected cash</span><strong>{formatMoney(current.expectedCashCents)}</strong><small>Live physical drawer balance</small></article><article><span>Opening cash</span><strong>{formatMoney(current.openingCashCents)}</strong><small>Starting float</small></article><article><span>Cash sales</span><strong>{formatMoney(current.cashSalesCents)}</strong><small>After customer change</small></article><article><span>Cash refunds</span><strong>{formatMoney(current.cashRefundsCents)}</strong><small>Cash returned</small></article><article><span>Cash in</span><strong>{formatMoney(current.cashInCents)}</strong><small>Manual additions</small></article><article><span>Cash out</span><strong>{formatMoney(current.cashOutCents)}</strong><small>Manual removals</small></article></div>
      <div className="drawer-actions"><button className="button primary" onClick={() => { requestKey.current = createId("cashdrawer"); setMovementType("CASH_IN"); }}><ArrowDownToLine size={18} /> Add cash</button><button className="button secondary" onClick={() => { requestKey.current = createId("cashdrawer"); setMovementType("CASH_OUT"); }}><ArrowUpFromLine size={18} /> Remove cash</button></div>
      <MovementTable session={current} />
    </> : null}

    {!loading && tab === "history" ? <>
      <section className="data-panel drawer-filters"><label>From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>To<input type="date" min={fromDate} value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="OPEN">Open</option><option value="CLOSED">Balanced</option><option value="REVIEW_REQUIRED">Review required</option><option value="REVIEWED">Reviewed</option></select></label></section>
      <div className="history-layout drawer-history-layout"><aside className="data-panel sale-list">{history.map((item) => <button className={selected?.id === item.id ? "selected" : ""} key={item.id} onClick={() => setSelected(item)}><strong>{item.businessDate}</strong><span>{item.openedByName}</span><b className={`drawer-status ${item.status.toLowerCase()}`}>{sessionStatus(item.status)}</b><small>{formatMoney(item.actualCashCents ?? item.expectedCashCents)}</small></button>)}{!history.length ? <p className="empty-state">No cash sessions match these filters.</p> : null}</aside>{selected ? <SessionDetail session={selected} duration={duration} canReview={canReview} reviewResolution={reviewResolution} reviewNotes={reviewNotes} setReviewResolution={setReviewResolution} setReviewNotes={setReviewNotes} onReview={() => void reviewSession()} busy={busy} /> : <div className="data-panel empty-workspace"><Banknote size={32} /><strong>Select a cash session</strong></div>}</div>
    </> : null}

    {movementType ? <div className="dialog-backdrop"><section className="dialog cash-movement-dialog"><div className="dialog-title"><h2>{movementType === "CASH_IN" ? "Add cash" : "Remove cash"}</h2><button aria-label="Close" onClick={() => setMovementType(null)}><X /></button></div><div className="form-stack"><label>Amount<input autoFocus type="number" min="0.01" step="0.01" value={movementAmount / 100} onChange={(event) => setMovementAmount(Math.round(Number(event.target.value) * 100))} /></label><label>Reason<select value={movementReason} onChange={(event) => setMovementReason(event.target.value)}>{movementReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label><label>{movementReason === "Other" ? "Reason details" : "Notes"}<textarea value={movementNotes} onChange={(event) => setMovementNotes(event.target.value)} required={movementReason === "Other"} /></label></div><div className="dialog-actions"><button className="button ghost" onClick={() => setMovementType(null)}>Cancel</button><button className="button primary" disabled={busy || movementAmount <= 0 || (movementReason === "Other" && movementNotes.trim().length < 3)} onClick={() => void saveMovement()}>Confirm {movementType === "CASH_IN" ? "cash in" : "cash out"}</button></div></section></div> : null}

    <ConfirmDialog open={closing} title="Close and count this drawer?" confirmLabel={busy ? "Closing" : "Close drawer"} disabled={busy || actualCash < 0} onClose={() => setClosing(false)} onConfirm={() => void closeDrawer()}>
      <div className="segmented"><button className={useCounter ? "active" : ""} onClick={() => setUseCounter(true)}><Scale size={16} /> Denominations</button><button className={!useCounter ? "active" : ""} onClick={() => setUseCounter(false)}>Enter total</button></div>
      {useCounter ? <div className="denomination-grid">{counts.map((item, index) => <label key={item.key}>{item.label}<input type="number" inputMode="numeric" min="0" step="1" value={item.quantity} onChange={(event) => setCounts((currentCounts) => currentCounts.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: Math.max(0, Math.trunc(Number(event.target.value))) } : entry))} /></label>)}</div> : <label>Actual cash counted<input type="number" min="0" step="0.01" value={manualActual / 100} onChange={(event) => setManualActual(Math.round(Number(event.target.value) * 100))} /></label>}
      <div className="cash-count-summary"><span>Expected <strong>{formatMoney(current?.expectedCashCents ?? 0)}</strong></span><span>Actual <strong>{formatMoney(actualCash)}</strong></span><span className={difference === 0 ? "balanced" : "difference"}>Difference <strong>{formatMoney(difference)}</strong></span></div>
      <label>Closing notes<textarea value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} /></label>
    </ConfirmDialog>
  </section>;
}

function MovementTable({ session }: { session: CashSessionRecord }) {
  return <section className="data-panel drawer-movements"><header><h3>Drawer movements</h3><span>{session.movements.length} entries</span></header><div className="table-scroll"><table><thead><tr><th>Time</th><th>Type</th><th>Reason</th><th>By</th><th>Amount</th></tr></thead><tbody>{[...session.movements].reverse().map((movement) => <tr key={movement.id}><td>{new Date(movement.createdAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</td><td>{movement.type.replaceAll("_", " ")}</td><td>{movement.reason}{movement.notes ? <small>{movement.notes}</small> : null}</td><td>{movement.createdByName}</td><td className={movement.direction > 0 ? "success" : "low"}>{movement.direction > 0 ? "+" : "-"}{formatMoney(movement.amountCents)}</td></tr>)}</tbody></table></div>{!session.movements.length ? <p className="empty-state">No cash movements yet.</p> : null}</section>;
}

function SessionDetail(props: { session: CashSessionRecord; duration: number; canReview: boolean; reviewResolution: string; reviewNotes: string; setReviewResolution: (value: string) => void; setReviewNotes: (value: string) => void; onReview: () => void; busy: boolean }) {
  const { session } = props;
  return <section className="data-panel receipt-detail drawer-session-detail"><header><div><span className="eyebrow">{session.businessDate}</span><h3>{session.openedByName}</h3><p>{sessionStatus(session.status)} | {props.duration} minutes</p></div><strong>{formatMoney(session.actualCashCents ?? session.expectedCashCents)}</strong></header><div className="cash-count-summary"><span>Opening <strong>{formatMoney(session.openingCashCents)}</strong></span><span>Expected <strong>{formatMoney(session.expectedCashCents)}</strong></span><span>Actual <strong>{session.actualCashCents === null ? "-" : formatMoney(session.actualCashCents)}</strong></span><span className={session.differenceCents === 0 ? "balanced" : "difference"}>Difference <strong>{session.differenceCents === null ? "-" : formatMoney(session.differenceCents)}</strong></span></div><MovementTable session={session} />{session.status === "REVIEW_REQUIRED" && props.canReview ? <div className="review-panel"><h4>Resolve difference</h4><label>Resolution<input value={props.reviewResolution} onChange={(event) => props.setReviewResolution(event.target.value)} placeholder="Accepted shortage, recovered overage..." /></label><label>Review notes<textarea value={props.reviewNotes} onChange={(event) => props.setReviewNotes(event.target.value)} /></label><button className="button primary" disabled={props.busy || props.reviewResolution.trim().length < 3 || props.reviewNotes.trim().length < 3} onClick={props.onReview}>Save review</button></div> : null}{session.reviewResolution ? <p className="notice-band"><strong>{session.reviewResolution}</strong> {session.reviewNotes}</p> : null}</section>;
}
