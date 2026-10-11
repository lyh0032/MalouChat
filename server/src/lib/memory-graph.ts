import { END, START, StateGraph, StateSchema } from '@langchain/langgraph'
import { z } from 'zod'

import { generateMemoryCandidates, type ExtractedMemory } from './ai'
import { applyAutoMemoryActions, type AutoMemoryAction } from '../modules/memories/memory.service'

type ExistingMemory = ExtractedMemory & {
  id?: string
}

type MemoryConflictCheck = {
  candidate: ExtractedMemory
  existingMemoryId?: string
  conflictType: 'create' | 'update' | 'skip'
  reason: string
}

type MemoryGraphPersistResult = {
  createdCount: number
  updatedCount: number
  skippedCount: number
}

const extractedMemorySchema = z.object({
  id: z.string().optional(),
  type: z.enum(['profile', 'preference', 'summary', 'fact']),
  key: z.string(),
  content: z.string()
})

const conflictCheckSchema = z.object({
  candidate: extractedMemorySchema.omit({ id: true }),
  existingMemoryId: z.string().optional(),
  conflictType: z.enum(['create', 'update', 'skip']),
  reason: z.string()
})

const autoMemoryActionSchema = z.object({
  type: z.enum(['create', 'update', 'skip']),
  memory: extractedMemorySchema.omit({ id: true }),
  existingMemoryId: z.string().optional(),
  reason: z.string()
})

const persistResultSchema = z.object({
  createdCount: z.number(),
  updatedCount: z.number(),
  skippedCount: z.number()
})

const MemoryGraphStateSchema = new StateSchema({
  userId: z.string(),
  userMessage: z.string(),
  existingMemories: z.array(extractedMemorySchema).default([]),
  modelOverride: z.string().optional(),
  candidateMemories: z.array(extractedMemorySchema.omit({ id: true })).default([]),
  shouldRemember: z.boolean().default(false),
  conflictChecks: z.array(conflictCheckSchema).default([]),
  memoryActions: z.array(autoMemoryActionSchema).default([]),
  persistResult: persistResultSchema.nullable().default(null),
  executionLog: z.array(z.string()).default([])
})

type MemoryGraphState = typeof MemoryGraphStateSchema.State

type MemoryGraphInput = {
  userId: string
  userMessage: string
  existingMemories: ExistingMemory[]
  modelOverride?: string
}

function buildSkippedPersistResult(skippedCount: number): MemoryGraphPersistResult {
  return {
    createdCount: 0,
    updatedCount: 0,
    skippedCount
  }
}

async function extractMemoryCandidatesNode(state: MemoryGraphState) {
  const candidateMemories = await generateMemoryCandidates({
    userMessage: state.userMessage,
    existingMemories: state.existingMemories,
    modelOverride: state.modelOverride
  })

  return {
    candidateMemories,
    executionLog: [
      ...state.executionLog,
      `memory-candidate-extraction: extracted=${candidateMemories.length}`
    ]
  }
}

function decideWhetherToRememberNode(state: MemoryGraphState) {
  const shouldRemember = state.candidateMemories.length > 0

  return {
    shouldRemember,
    executionLog: [...state.executionLog, `memory-worth-check: shouldRemember=${shouldRemember}`],
    persistResult: shouldRemember ? state.persistResult : buildSkippedPersistResult(0)
  }
}

function checkMemoryConflictsNode(state: MemoryGraphState) {
  const existingMemoryMap = new Map(state.existingMemories.map((memory) => [memory.key, memory]))

  const conflictChecks: MemoryConflictCheck[] = state.candidateMemories.map((candidate) => {
    const matchedMemory = existingMemoryMap.get(candidate.key)

    if (!matchedMemory) {
      return {
        candidate,
        conflictType: 'create',
        reason: '未找到同 key 记忆，准备新增'
      }
    }

    if (
      matchedMemory.type === candidate.type &&
      matchedMemory.content.trim() === candidate.content.trim()
    ) {
      return {
        candidate,
        existingMemoryId: matchedMemory.id,
        conflictType: 'skip',
        reason: '已有相同 key 且内容一致，跳过'
      }
    }

    return {
      candidate,
      existingMemoryId: matchedMemory.id,
      conflictType: 'update',
      reason: '已有相同 key 但内容变化，准备更新'
    }
  })

  return {
    conflictChecks,
    executionLog: [...state.executionLog, `memory-conflict-check: checked=${conflictChecks.length}`]
  }
}

function decideMemoryActionsNode(state: MemoryGraphState) {
  const memoryActions: AutoMemoryAction[] = state.conflictChecks.map((item) => ({
    type: item.conflictType,
    memory: item.candidate,
    existingMemoryId: item.existingMemoryId,
    reason: item.reason
  }))

  return {
    memoryActions,
    executionLog: [
      ...state.executionLog,
      `memory-action-decision: actionable=${memoryActions.filter((item) => item.type !== 'skip').length}`
    ],
    persistResult: memoryActions.some((item) => item.type !== 'skip')
      ? state.persistResult
      : buildSkippedPersistResult(memoryActions.length)
  }
}

async function writeMemoryActionsNode(state: MemoryGraphState) {
  const persistResult = await applyAutoMemoryActions(state.userId, state.memoryActions)

  return {
    persistResult,
    executionLog: [
      ...state.executionLog,
      `memory-write: created=${persistResult.createdCount}, updated=${persistResult.updatedCount}, skipped=${persistResult.skippedCount}`
    ]
  }
}

function recordMemoryResultNode(state: MemoryGraphState) {
  const persistResult =
    state.persistResult ?? buildSkippedPersistResult(state.memoryActions.length || 0)
  const logLine = `memory-result: created=${persistResult.createdCount}, updated=${persistResult.updatedCount}, skipped=${persistResult.skippedCount}`

  console.log('[memory-graph]', {
    userId: state.userId,
    userMessage: state.userMessage,
    logs: [...state.executionLog, logLine]
  })

  return {
    persistResult,
    executionLog: [...state.executionLog, logLine]
  }
}

const memoryGraph = new StateGraph(MemoryGraphStateSchema)
  .addNode('extractMemoryCandidates', extractMemoryCandidatesNode)
  .addNode('decideWhetherToRemember', decideWhetherToRememberNode)
  .addNode('checkMemoryConflicts', checkMemoryConflictsNode)
  .addNode('decideMemoryActions', decideMemoryActionsNode)
  .addNode('writeMemoryActions', writeMemoryActionsNode)
  .addNode('recordMemoryResult', recordMemoryResultNode)
  .addEdge(START, 'extractMemoryCandidates')
  .addEdge('extractMemoryCandidates', 'decideWhetherToRemember')
  .addConditionalEdges(
    'decideWhetherToRemember',
    (state) => (state.shouldRemember ? 'checkMemoryConflicts' : 'recordMemoryResult'),
    ['checkMemoryConflicts', 'recordMemoryResult']
  )
  .addEdge('checkMemoryConflicts', 'decideMemoryActions')
  .addConditionalEdges(
    'decideMemoryActions',
    (state) =>
      state.memoryActions.some((item) => item.type !== 'skip')
        ? 'writeMemoryActions'
        : 'recordMemoryResult',
    ['writeMemoryActions', 'recordMemoryResult']
  )
  .addEdge('writeMemoryActions', 'recordMemoryResult')
  .addEdge('recordMemoryResult', END)
  .compile()

export async function runLongTermMemoryGraph(input: MemoryGraphInput) {
  const result = await memoryGraph.invoke({
    userId: input.userId,
    userMessage: input.userMessage,
    existingMemories: input.existingMemories,
    modelOverride: input.modelOverride
  })

  return {
    candidateMemories: result.candidateMemories,
    memoryActions: result.memoryActions,
    persistResult: result.persistResult,
    executionLog: result.executionLog
  }
}
