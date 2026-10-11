import { prisma } from '../../lib/prisma'
import { deleteObject } from '../../utils/obs'

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000
const ORPHAN_AGE_MS = 7 * 24 * 60 * 60 * 1000

export async function cleanupOrphanFiles() {
  const deadline = new Date(Date.now() - ORPHAN_AGE_MS)

  try {
    const orphans = await prisma.fileUpload.findMany({
      where: {
        messageId: null,
        conversationDraft: { is: null },
        conversationReferences: { none: {} },
        createdAt: { lt: deadline }
      },
      select: { id: true, storageKey: true }
    })

    if (orphans.length === 0) return

    console.log(`清理孤文件: 发现 ${orphans.length} 个`)

    for (const file of orphans) {
      try {
        await deleteObject(file.storageKey)
      } catch {
        // 对象存储删除失败不影响 DB 清理
      }

      await prisma.fileChunk.deleteMany({ where: { fileId: file.id } })
      await prisma.fileUpload.delete({ where: { id: file.id } })
    }

    console.log(`清理完成: 删除了 ${orphans.length} 个孤文件`)
  } catch (error) {
    console.error('孤文件清理失败:', error)
  }
}

export function startCleanupScheduler() {
  cleanupOrphanFiles()
  setInterval(cleanupOrphanFiles, CLEANUP_INTERVAL_MS)
  console.log(`孤文件清理定时器已启动，间隔 ${CLEANUP_INTERVAL_MS / 1000 / 60 / 60} 小时`)
}
