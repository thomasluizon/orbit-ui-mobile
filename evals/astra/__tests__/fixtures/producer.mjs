// Contract: orbit-api d0bed4eb, ChatResponse, ChatEvalTrace and AiToolCallResult.
export function toolCall(name, arguments_, status = 'Succeeded', id = 'call-1') {
  return {
    id, name, arguments: arguments_, status,
    result: {
      name, id, success: status === 'Succeeded' || status === 'PendingConfirmation',
      entityId: null, entityName: null, error: null,
      payload: status === 'PendingConfirmation' ? {
        status: 'awaiting_confirmation', item_count: null, habit_count: null, date_count: null,
        proposed_titles: null, proposed_values: {}, resolved_habits: [], dates: null,
        instruction: 'This is a proposal. Nothing has changed until approval. Use only the returned numbers, names, and dates.',
      } : { count: 2 },
    },
  }
}

export function chatResponse(requestId, toolCalls = []) {
  return {
    aiMessage: 'Water is ready.', actions: [], operations: null, pendingOperations: null,
    policyDenials: null, correlationId: requestId, relatedSurfaces: null, habitList: null,
    goalList: null, metricsCard: null, periodInsight: null, daySummary: null, streak: null,
    calendar: null, recordLists: null, accountRows: null, followUps: null,
    evalTrace: { traceId: requestId, toolCalls },
  }
}
