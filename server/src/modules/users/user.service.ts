import { prisma } from '../../lib/prisma'

export async function searchUsers(currentUserId: string, query: string) {
  const keyword = query.trim()

  if (!keyword) {
    return { users: [] }
  }

  const users = await prisma.user.findMany({
    where: {
      id: { not: currentUserId },
      type: 'registered',
      OR: [
        { username: { contains: keyword, mode: 'insensitive' } },
        { email: { contains: keyword, mode: 'insensitive' } }
      ]
    },
    orderBy: [{ username: 'asc' }],
    take: 20,
    select: {
      id: true,
      username: true,
      email: true
    }
  })

  return { users }
}
