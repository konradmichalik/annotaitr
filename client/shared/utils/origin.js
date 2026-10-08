/** Who started the review (`--origin`) and is waiting for the decision on stdout. */
const AGENT_NAMES = {
  'claude-code': 'Claude Code',
  'codex': 'Codex',
  'opencode': 'OpenCode',
  'vibe': 'Mistral Vibe',
  'gemini': 'Gemini CLI'
}

/** The calling agent's full name, or null for a plain terminal or an unknown origin. */
export function agentName(origin) {
  return AGENT_NAMES[origin] ?? null
}

export function waitingLabel(origin) {
  return `${agentName(origin) ?? 'Terminal'} is waiting`
}

export function originTooltip(origin) {
  const name = agentName(origin)
  return name
    ? `Started from ${name}. Your decision is printed back to that session.`
    : 'Started from the terminal. Your decision is printed back to that terminal.'
}

export function decisionLegend(origin) {
  return `What should ${agentName(origin) ?? 'the agent'} do?`
}
