import { type StructuredToolInterface } from '@langchain/core/tools'
import { webSearchTool } from './webSearch'
import { drawImageTool } from './drawImage'
import { readFileTool } from './readFile'
import { semanticSearchTool } from './semanticSearch'
import { userLocationTool } from './userLocation'

export const tools: StructuredToolInterface[] = [
  webSearchTool,
  drawImageTool,
  readFileTool,
  semanticSearchTool,
  userLocationTool
]
