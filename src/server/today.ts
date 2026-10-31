/** Business date is fixed for reproducible demos; wall time is only for audit timestamps. */
export function today(): string {
  return process.env.DEMO_TODAY || '2026-09-02';
}
export function demoTimestamp(): string {
  return `${today()}T${new Date().toISOString().split('T')[1]}`;
}
