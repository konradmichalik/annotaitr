import { describe, it, expect } from 'vitest'
import { agentName, waitingLabel, originTooltip, decisionLegend } from '../../../client/shared/utils/origin.js'

describe('origin labels', () => {
  it('names each agent in full', () => {
    expect(agentName('claude-code')).toBe('Claude Code')
    expect(agentName('opencode')).toBe('OpenCode')
    expect(agentName('vibe')).toBe('Mistral Vibe')
  })

  it('has no agent name for a plain terminal or an unknown origin', () => {
    expect(agentName('cli')).toBeNull()
    expect(agentName(undefined)).toBeNull()
    expect(agentName('other')).toBeNull()
  })

  it('says who is waiting, with the terminal as the fallback', () => {
    expect(waitingLabel('claude-code')).toBe('Claude Code is waiting')
    expect(waitingLabel('opencode')).toBe('OpenCode is waiting')
    expect(waitingLabel('vibe')).toBe('Mistral Vibe is waiting')
    expect(waitingLabel('cli')).toBe('Terminal is waiting')
    expect(waitingLabel(undefined)).toBe('Terminal is waiting')
  })

  it('explains where the decision goes', () => {
    expect(originTooltip('claude-code')).toBe('Started from Claude Code. Your decision is printed back to that session.')
    expect(originTooltip('cli')).toBe('Started from the terminal. Your decision is printed back to that terminal.')
  })

  it('asks the agent by name, or the agent in general', () => {
    expect(decisionLegend('opencode')).toBe('What should OpenCode do?')
    expect(decisionLegend('cli')).toBe('What should the agent do?')
  })
})
