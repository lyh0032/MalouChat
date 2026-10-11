import { z } from 'zod'

import { SPEECH_STYLE_IDS } from '../../lib/speech-style'

export const updateSpeechStyleBodySchema = z.object({
  speechStyle: z.enum(SPEECH_STYLE_IDS)
})

export type UpdateSpeechStyleBody = z.infer<typeof updateSpeechStyleBodySchema>
