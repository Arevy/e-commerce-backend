import type { Request, Response } from 'express'
import type { SessionRecord } from '../services/sessionService'

export interface GraphQLContext {
  req: Request
  res: Response
  session: SessionRecord | null
}
