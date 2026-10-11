import { tool, type StructuredToolInterface } from '@langchain/core/tools'

type StructuredToolFactoryFields = {
  name: string
  description: string
  schema: unknown
}

export function createStructuredTool(
  func: (input: unknown) => unknown,
  fields: StructuredToolFactoryFields
): StructuredToolInterface {
  return tool(func as never, fields as never) as StructuredToolInterface
}
