export type CmsStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export interface CmsPage {
  id: number
  slug: string
  title: string
  excerpt: string | null
  body: string
  status: CmsStatus
  publishedAt: string | null
  updatedAt: string
  createdAt: string
}
