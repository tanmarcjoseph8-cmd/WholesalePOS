export class OperationCoordinator {
  private paymentCount = 0;
  private resetActive = false;

  beginPayment() {
    if (this.resetActive) throw new Error("A factory reset is in progress.");
    this.paymentCount += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.paymentCount = Math.max(0, this.paymentCount - 1);
    };
  }

  beginReset() {
    if (this.resetActive) throw new Error("A factory reset is already in progress.");
    if (this.paymentCount > 0) throw new Error("Wait for the active payment to finish before resetting the app.");
    this.resetActive = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.resetActive = false;
    };
  }

  isPaymentActive() {
    return this.paymentCount > 0;
  }

  isResetActive() {
    return this.resetActive;
  }
}

export const operationCoordinator = new OperationCoordinator();
