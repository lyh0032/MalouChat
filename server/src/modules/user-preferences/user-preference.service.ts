import { prisma } from '../../lib/prisma'
import { AppError } from '../../utils/app-error'
import { getSpeechStyleById, SPEECH_STYLES } from '../../lib/speech-style'
import type { UpdateSpeechStyleBody } from './user-preference.schema'

export async function getAvailableSpeechStyles() {
  return SPEECH_STYLES.map(({ id, name }) => ({ id, name }))
}

export async function getUserSpeechStyle(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { speechStyle: true }
  })

  if (!user) {
    throw new AppError(404, '用户不存在', 'USER_NOT_FOUND')
  }

  const style = getSpeechStyleById(user.speechStyle)
  return {
    id: style.id,
    name: style.name
  }
}

export async function updateUserSpeechStyle(userId: string, data: UpdateSpeechStyleBody) {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { speechStyle: data.speechStyle },
    select: { speechStyle: true }
  })

  const style = getSpeechStyleById(updatedUser.speechStyle)
  return {
    id: style.id,
    name: style.name
  }
}

export async function getUserSpeechStyleId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { speechStyle: true }
  })

  if (!user) {
    throw new AppError(404, '用户不存在', 'USER_NOT_FOUND')
  }

  return getSpeechStyleById(user.speechStyle).id
}
