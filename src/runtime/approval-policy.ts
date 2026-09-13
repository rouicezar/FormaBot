// E03b 逐动作审批（R30）：发布型外部动作默认要求审批；显式规则可放行或收紧，
// require 规则恒优先于放行规则。Bash 无出站网络（E02b-1），不能旁路浏览器审批。
export interface ApprovalRule { host: string; action: string; decision: 'always_allow' | 'require' }
export interface ApprovalCall { tool: 'browser'; action: 'open' | 'read' | 'click' | 'fill'; url?: string }

function safeHost(url?: string): string {
  try { return new URL(url ?? '').host; } catch { return ''; }
}
function matches(rule: ApprovalRule, call: ApprovalCall, host: string): boolean {
  if (rule.action !== '*' && rule.action !== call.action) return false;
  return host !== '' && rule.host === host;
}
export function evaluateApproval(rules: ApprovalRule[], call: ApprovalCall): 'allow' | 'approval' {
  if (call.tool !== 'browser') return 'allow';
  if (call.action !== 'click' && call.action !== 'fill') return 'allow';
  const host = safeHost(call.url);
  let allowed = false;
  for (const rule of rules) {
    if (!matches(rule, call, host)) continue;
    if (rule.decision === 'require') return 'approval';
    allowed = true;
  }
  // 无规则覆盖的发布型动作（点击/填表可能造成外发）一律要求审批。
  return allowed ? 'allow' : 'approval';
}
