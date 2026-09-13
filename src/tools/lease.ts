// E03a 资源租约：人类接管期间 Bot 不抢控；租约到期自动归还，不要求用户手动释放。
export class ControlLease {
  private until = 0;
  constructor(private defaultMs = 60000) {}
  hold(ms = this.defaultMs) { this.until = Date.now() + Math.max(0, ms); }
  release() { this.until = 0; }
  held(now = Date.now()) { return now < this.until; }
  remainingMs(now = Date.now()) { return Math.max(0, this.until - now); }
}
