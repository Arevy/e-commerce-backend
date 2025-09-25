// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../config/database'
import { cacheDel, cacheGet, cacheSet } from '../config/redis'
import { logger } from '../utils/logger'
import type { CmsPage, CmsStatus } from '../models/cmsPage'

const CMS_SELECT = `
  SELECT
    ID,
    SLUG,
    TITLE,
    EXCERPT,
    BODY,
    STATUS,
    PUBLISHED_AT,
    UPDATED_AT,
    CREATED_AT
  FROM CMS_PAGES
`

const LIST_CACHE_PREFIX = 'cms:list'
const PAGE_CACHE_PREFIX = 'cms:page'
const STATUS_CACHE_KEYS: CmsStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED']

const mapCmsRow = (row: any[]): CmsPage => ({
  id: Number(row[0]),
  slug: row[1],
  title: row[2],
  excerpt: row[3] ?? null,
  body: row[4],
  status: (row[5] ?? 'DRAFT') as CmsStatus,
  publishedAt: row[6] ? new Date(row[6]).toISOString() : null,
  updatedAt: new Date(row[7]).toISOString(),
  createdAt: new Date(row[8]).toISOString(),
})

const buildListCacheKey = (status?: CmsStatus | 'ALL', search?: string) => {
  const normalizedStatus = (status ?? 'ALL').toUpperCase()
  const normalizedSearch = search ? search.trim().toLowerCase() : 'all'
  return `${LIST_CACHE_PREFIX}:${normalizedStatus}:${normalizedSearch}`
}

const buildPageCacheKey = (slug: string) => `${PAGE_CACHE_PREFIX}:${slug}`

const normalizeStatus = (status?: string | null): CmsStatus | undefined => {
  if (!status) return undefined
  const value = status.trim().toUpperCase()
  if (value === 'DRAFT' || value === 'PUBLISHED' || value === 'ARCHIVED') {
    return value
  }
  return undefined
}

const invalidateCaches = async (slug?: string) => {
  const keysToInvalidate = new Set<string>()
  keysToInvalidate.add(buildListCacheKey('ALL'))
  STATUS_CACHE_KEYS.forEach((status) => {
    keysToInvalidate.add(buildListCacheKey(status))
  })

  await Promise.allSettled(
    Array.from(keysToInvalidate).map((key) => cacheDel(key)),
  )

  if (slug) {
    await cacheDel(buildPageCacheKey(slug))
  }
}

interface CmsQueryOptions {
  status?: string | null
  search?: string | null
  includeDrafts?: boolean
}

export const CmsService = {
  getAll: async ({ status, search, includeDrafts = false }: CmsQueryOptions = {}) => {
    const normalizedStatus = normalizeStatus(status)
    const cacheStatus: CmsStatus | 'ALL' = includeDrafts
      ? normalizedStatus ?? 'ALL'
      : normalizedStatus ?? 'PUBLISHED'
    const filterStatus: CmsStatus | undefined = cacheStatus === 'ALL' ? undefined : cacheStatus
    const trimmedSearch = search?.trim() || ''

    const cacheKey = buildListCacheKey(cacheStatus, trimmedSearch)
    const cached = await cacheGet<CmsPage[]>(cacheKey)
    if (cached) {
      return cached
    }

    const connection = await getConnectionFromPool()
    try {
      const clauses: string[] = []
      const params: Record<string, unknown> = {}

      if (filterStatus) {
        clauses.push('STATUS = :status')
        params.status = filterStatus
      }

      if (trimmedSearch) {
        clauses.push('(LOWER(SLUG) LIKE :search OR LOWER(TITLE) LIKE :search)')
        params.search = `%${trimmedSearch.toLowerCase()}%`
      }

      let query = CMS_SELECT
      if (clauses.length) {
        query += ` WHERE ${clauses.join(' AND ')}`
      }
      query += ' ORDER BY UPDATED_AT DESC'

      const result = await connection.execute(query, params)
      const pages = (result.rows || []).map((row: any[]) => mapCmsRow(row))

      await cacheSet(cacheKey, pages, 60)
      return pages
    } catch (err) {
      logger.error('Error in CmsService.getAll', err)
      throw err
    } finally {
      await connection.close()
    }
  },

  getBySlug: async (slug: string, options: { includeDrafts?: boolean } = {}) => {
    const cacheKey = buildPageCacheKey(slug)
    if (!options.includeDrafts) {
      const cached = await cacheGet<CmsPage | null>(cacheKey)
      if (cached) {
        return cached
      }
    }

    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `${CMS_SELECT} WHERE SLUG = :slug` + (options.includeDrafts ? '' : ' AND STATUS = \'PUBLISHED\''),
        { slug },
      )

      if (!result.rows?.length) {
        if (!options.includeDrafts) {
          await cacheSet(cacheKey, null, 30)
        }
        return null
      }

      const page = mapCmsRow(result.rows[0] as any[])
      if (!options.includeDrafts) {
        await cacheSet(cacheKey, page, 60)
      }
      return page
    } catch (err) {
      logger.error('Error in CmsService.getBySlug', err)
      throw err
    } finally {
      await connection.close()
    }
  },

  getById: async (id: number) => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(`${CMS_SELECT} WHERE ID = :id`, { id })
      if (!result.rows?.length) return null
      return mapCmsRow(result.rows[0] as any[])
    } catch (err) {
      logger.error('Error in CmsService.getById', err)
      throw err
    } finally {
      await connection.close()
    }
  },

  create: async (
    input: {
      slug: string
      title: string
      excerpt?: string | null
      body: string
      status?: CmsStatus
      publishedAt?: string | null
    },
  ): Promise<CmsPage> => {
    const connection = await getConnectionFromPool()
    try {
      const status = input.status ? normalizeStatus(input.status) ?? 'DRAFT' : 'DRAFT'
      const autoPublish = status === 'PUBLISHED'

      const result = await connection.execute(
        `INSERT INTO CMS_PAGES (SLUG, TITLE, EXCERPT, BODY, STATUS, PUBLISHED_AT, UPDATED_AT, CREATED_AT)
         VALUES (:slug, :title, :excerpt, :body, :status, :publishedAt, SYSTIMESTAMP, SYSTIMESTAMP)
         RETURNING ID INTO :id`,
        {
          slug: input.slug,
          title: input.title,
          excerpt: input.excerpt,
          body: input.body,
          status,
          publishedAt: autoPublish
            ? input.publishedAt
              ? new Date(input.publishedAt)
              : new Date()
            : null,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: true },
      )

      const newId = Number((result.outBinds as any).id[0])
      const created = await CmsService.getById(newId)
      await invalidateCaches(created?.slug)
      if (!created) {
        throw new Error('Failed to load created CMS page')
      }
      return created
    } catch (err) {
      logger.error('Error in CmsService.create', err)
      throw err
    } finally {
      await connection.close()
    }
  },

  update: async (
    id: number,
    input: {
      slug?: string
      title?: string
      excerpt?: string | null
      body?: string
      status?: CmsStatus
      publishedAt?: string | null
    },
  ): Promise<CmsPage> => {
    const connection = await getConnectionFromPool()
    try {
      const fields: string[] = []
      const params: Record<string, unknown> = { id }

      if (input.slug !== undefined) {
        fields.push('SLUG = :slug')
        params.slug = input.slug
      }
      if (input.title !== undefined) {
        fields.push('TITLE = :title')
        params.title = input.title
      }
      if (input.excerpt !== undefined) {
        fields.push('EXCERPT = :excerpt')
        params.excerpt = input.excerpt
      }
      if (input.body !== undefined) {
        fields.push('BODY = :body')
        params.body = input.body
      }
      if (input.status !== undefined) {
        fields.push('STATUS = :status')
        params.status = normalizeStatus(input.status) ?? 'DRAFT'
      }
      if (input.publishedAt !== undefined) {
        fields.push('PUBLISHED_AT = :publishedAt')
        params.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null
      }

      if (!fields.length) {
        throw new Error('Nothing to update for CMS page')
      }

      fields.push('UPDATED_AT = SYSTIMESTAMP')

      const result = await connection.execute(
        `UPDATE CMS_PAGES SET ${fields.join(', ')} WHERE ID = :id`,
        params,
        { autoCommit: true },
      )

      if (!result.rowsAffected) {
        throw new Error(`CMS page ${id} not found`)
      }
    } catch (err) {
      logger.error('Error in CmsService.update', err)
      throw err
    } finally {
      await connection.close()
    }

    const updated = await CmsService.getById(id)
    if (!updated) {
      throw new Error(`CMS page ${id} not found after update`)
    }
    await invalidateCaches(updated.slug)
    return updated
  },

  publish: async (id: number) => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `UPDATE CMS_PAGES
            SET STATUS = 'PUBLISHED', PUBLISHED_AT = SYSTIMESTAMP, UPDATED_AT = SYSTIMESTAMP
          WHERE ID = :id`,
        { id },
        { autoCommit: true },
      )

      if (!result.rowsAffected) {
        throw new Error(`CMS page ${id} not found`)
      }
    } catch (err) {
      logger.error('Error in CmsService.publish', err)
      throw err
    } finally {
      await connection.close()
    }

    const updated = await CmsService.getById(id)
    if (!updated) {
      throw new Error(`CMS page ${id} not found after publish`)
    }
    await invalidateCaches(updated.slug)
    return updated
  },

  remove: async (id: number) => {
    const existing = await CmsService.getById(id)
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `DELETE FROM CMS_PAGES WHERE ID = :id`,
        { id },
        { autoCommit: true },
      )
      const deleted = Boolean(result.rowsAffected)
      if (deleted) {
        await invalidateCaches(existing?.slug)
      }
      return deleted
    } catch (err) {
      logger.error('Error in CmsService.remove', err)
      throw err
    } finally {
      await connection.close()
    }
  },
}
