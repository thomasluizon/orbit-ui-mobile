import type { AstraPlan, AstraPlanStep } from '../types/astra-plan'

export const planOperationId = '00000000-0000-4000-8000-000000000077'

export function makeAstraPlan(locale = 'en'): AstraPlan {
  return {
    id: '00000000-0000-4000-8000-000000001977',
    title: locale === 'pt-BR' ? 'Organizar a rotina' : 'Organize the routine',
    steps: [
      { id: '1', text: locale === 'pt-BR' ? 'Consultar os hábitos' : 'Check habits', status: 'pending', tool: 'get_habits', phase: 'execution' },
      { id: '2', text: locale === 'pt-BR' ? 'Consultar as metas' : 'Check goals', status: 'pending', tool: 'get_goals', phase: 'execution' },
    ],
  }
}

export function makeApprovalPlan(status = 'pending'): AstraPlan {
  const plan = makeAstraPlan()
  const execution: AstraPlanStep = { ...plan.steps[0]!, text: 'Prepare habits', tool: 'create_habit', toolCallId: 'call-1', status: 'done' }
  return { ...plan, steps: [execution, { ...execution, id: '2', text: 'Save habits', phase: 'approval', pendingOperationId: planOperationId, status }] }
}
