type MessageWithCreationTime = {
  id: string
  createdAt: string
}

export function findMessageInsertionIndex(
  messages: MessageWithCreationTime[],
  message: MessageWithCreationTime
) {
  const messageTime = Date.parse(message.createdAt)

  if (Number.isNaN(messageTime)) {
    return messages.length
  }

  const index = messages.findIndex((item) => {
    const itemTime = Date.parse(item.createdAt)
    return !Number.isNaN(itemTime) && itemTime > messageTime
  })

  return index === -1 ? messages.length : index
}
