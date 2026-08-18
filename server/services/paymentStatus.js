/**
 * Computes payment status from tax due, schedule, and payment list.
 * @param {{ taxDue: number, paymentSchedule: string, payments: { amount: number }[] }} input
 */
export function computePaymentStatus({ taxDue, paymentSchedule, payments }) {
  // payments.amount holds each receipt's TOTAL (sum of its items), so summing
  // amount gives the total paid against this assessment.
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const balance = Math.max(0, taxDue - totalPaid);

  if (totalPaid <= 0) {
    return { totalPaid, balance, status: "Not Paid" };
  }

  if (balance <= 0.009) {
    return { totalPaid, balance: 0, status: "Fully Paid" };
  }

  if (paymentSchedule === "quarterly") {
    const quarterDue = taxDue / 4;
    const quartersPaid = Math.floor(totalPaid / quarterDue);
    if (quartersPaid >= 1 && quartersPaid < 4) {
      return { totalPaid, balance, status: "Quarterly" };
    }
  }

  if (paymentSchedule === "semi_annual") {
    const semiDue = taxDue / 2;
    const semiPaid = Math.floor(totalPaid / semiDue);
    if (semiPaid >= 1 && semiPaid < 2) {
      return { totalPaid, balance, status: "Semi-Annual" };
    }
  }

  return { totalPaid, balance, status: "Partially Paid" };
}
