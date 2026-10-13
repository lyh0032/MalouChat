import { t } from '../i18n'
import { ensureFetchResponseOk, fetchWithAuth } from './http'
import type {
  CreateKnowledgeBaseInput,
  KnowledgeBaseInvitation,
  KnowledgeBaseMember,
  KnowledgeBaseRecord,
  KnowledgeBaseVisibility,
  UpdateKnowledgeBaseInput
} from '../types/knowledge-base'

export async function fetchKnowledgeBases(): Promise<KnowledgeBaseRecord[]> {
  const response = await fetchWithAuth('/knowledge-bases', { method: 'GET' })
  await ensureFetchResponseOk(response, t('ui.failedToLoadKnowledgeBases'))
  const json = await response.json()
  return json.data.knowledgeBases as KnowledgeBaseRecord[]
}

export async function createKnowledgeBase(
  input: CreateKnowledgeBaseInput
): Promise<KnowledgeBaseRecord> {
  const formData = new FormData()
  formData.append('title', input.title)
  formData.append('content', input.content)
  formData.append('visibility', input.visibility || 'private')

  if (input.file) {
    formData.append('file', input.file)
  }

  const response = await fetchWithAuth('/knowledge-bases', {
    method: 'POST',
    body: formData
  })

  await ensureFetchResponseOk(response, t('ui.failedToCreateTheKnowledgeBase'))
  const json = await response.json()
  return json.data as KnowledgeBaseRecord
}

export async function updateKnowledgeBase(
  knowledgeBaseId: string,
  input: UpdateKnowledgeBaseInput
): Promise<KnowledgeBaseRecord> {
  const formData = new FormData()
  formData.append('title', input.title)
  formData.append('content', input.content)
  formData.append('visibility', input.visibility || 'private')

  if (input.file) {
    formData.append('file', input.file)
  }

  const response = await fetchWithAuth(`/knowledge-bases/${knowledgeBaseId}`, {
    method: 'PATCH',
    body: formData
  })

  await ensureFetchResponseOk(response, t('ui.failedToUpdateTheKnowledgeBase'))
  const json = await response.json()
  return json.data as KnowledgeBaseRecord
}

export async function updateKnowledgeBaseVisibility(
  knowledgeBaseId: string,
  visibility: KnowledgeBaseVisibility
): Promise<KnowledgeBaseRecord> {
  const response = await fetchWithAuth(`/knowledge-bases/${knowledgeBaseId}/visibility`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ visibility })
  })
  await ensureFetchResponseOk(response, t('ui.failedToUpdateTheKnowledgeBaseStatus'))
  const json = await response.json()
  return json.data as KnowledgeBaseRecord
}

export async function fetchKnowledgeBaseMembers(
  knowledgeBaseId: string
): Promise<KnowledgeBaseMember[]> {
  const response = await fetchWithAuth(`/knowledge-bases/${knowledgeBaseId}/members`, {
    method: 'GET'
  })
  await ensureFetchResponseOk(response, t('ui.failedToLoadTeamMembers'))
  const json = await response.json()
  return json.data.members as KnowledgeBaseMember[]
}

export async function inviteKnowledgeBaseMembers(
  knowledgeBaseId: string,
  userIds: string[]
): Promise<{
  createdCount: number
  skippedMemberCount: number
  skippedInvitationCount: number
}> {
  const response = await fetchWithAuth(`/knowledge-bases/${knowledgeBaseId}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userIds })
  })
  await ensureFetchResponseOk(response, t('ui.failedToSendTheInvitation'))
  const json = await response.json()
  return json.data as {
    createdCount: number
    skippedMemberCount: number
    skippedInvitationCount: number
  }
}

export async function removeKnowledgeBaseMember(
  knowledgeBaseId: string,
  userId: string
): Promise<void> {
  const response = await fetchWithAuth(`/knowledge-bases/${knowledgeBaseId}/members/${userId}`, {
    method: 'DELETE'
  })
  await ensureFetchResponseOk(response, t('ui.failedToRemoveTheMember'))
}

export async function leaveKnowledgeBase(knowledgeBaseId: string): Promise<void> {
  const response = await fetchWithAuth(`/knowledge-bases/${knowledgeBaseId}/leave`, {
    method: 'DELETE'
  })
  await ensureFetchResponseOk(response, t('ui.failedToLeaveTheKnowledgeBase'))
}

export async function fetchKnowledgeBaseInvitations(): Promise<KnowledgeBaseInvitation[]> {
  const response = await fetchWithAuth('/knowledge-bases/invitations', { method: 'GET' })
  await ensureFetchResponseOk(response, t('ui.failedToLoadKnowledgeBaseInvitations'))
  const json = await response.json()
  return json.data.invitations as KnowledgeBaseInvitation[]
}

export async function acceptKnowledgeBaseInvitation(invitationId: string): Promise<void> {
  const response = await fetchWithAuth(`/knowledge-bases/invitations/${invitationId}/accept`, {
    method: 'POST'
  })
  await ensureFetchResponseOk(response, t('ui.failedToAcceptTheInvitation'))
}

export async function rejectKnowledgeBaseInvitation(invitationId: string): Promise<void> {
  const response = await fetchWithAuth(`/knowledge-bases/invitations/${invitationId}/reject`, {
    method: 'POST'
  })
  await ensureFetchResponseOk(response, t('ui.failedToDeclineTheInvitation'))
}

export async function deleteKnowledgeBase(knowledgeBaseId: string): Promise<void> {
  const response = await fetchWithAuth(`/knowledge-bases/${knowledgeBaseId}`, {
    method: 'DELETE'
  })
  await ensureFetchResponseOk(response, t('ui.failedToDeleteTheKnowledgeBase'))
}
