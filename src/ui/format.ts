const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mar 2004" for a month count since Jan 2000. */
export function monthLabel(month: number): string {
  return `${MONTHS[((month % 12) + 12) % 12]} ${2000 + Math.floor(month / 12)}`;
}
