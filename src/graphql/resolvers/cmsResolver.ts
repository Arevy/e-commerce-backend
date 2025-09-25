import { CmsService } from '../../services/cmsService'
import { validateInput } from '../../utils/validateInput'
import type { CmsStatus } from '../../models/cmsPage'

const toNumber = (value?: string | null) => {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

export const cmsResolver = {
  Query: {
    getCmsPages: (
      _: unknown,
      args: { status?: CmsStatus; search?: string },
    ) => CmsService.getAll({ status: args.status, search: args.search }),
    getCmsPage: (_: unknown, { slug }: { slug: string }) =>
      CmsService.getBySlug(slug, { includeDrafts: false }),
  },

  Mutation: {
    createCmsPage: (
      _: unknown,
      { input }: { input: { slug: string; title: string; excerpt?: string | null; body: string; status?: CmsStatus; publishedAt?: string | null } },
    ) => {
      validateInput(input, {
        slug: { required: true, type: 'string' },
        title: { required: true, type: 'string' },
        body: { required: true, type: 'string' },
      })
      return CmsService.create(input)
    },

    updateCmsPage: (
      _: unknown,
      { id, input }: { id: string; input: { slug?: string; title?: string; excerpt?: string | null; body?: string; status?: CmsStatus; publishedAt?: string | null } },
    ) => {
      validateInput({ id, ...input }, { id: { required: true, type: 'string' } })
      const numericId = toNumber(id)
      if (numericId === undefined) {
        throw new Error('Invalid CMS page id')
      }
      return CmsService.update(numericId, input)
    },

    deleteCmsPage: (_: unknown, { id }: { id: string }) => {
      const numericId = toNumber(id)
      if (numericId === undefined) {
        throw new Error('Invalid CMS page id')
      }
      return CmsService.remove(numericId)
    },

    publishCmsPage: (_: unknown, { id }: { id: string }) => {
      const numericId = toNumber(id)
      if (numericId === undefined) {
        throw new Error('Invalid CMS page id')
      }
      return CmsService.publish(numericId)
    },
  },

  CustomerSupportQuery: {
    cmsPages: (
      _: unknown,
      args: { status?: CmsStatus; search?: string },
    ) => CmsService.getAll({ status: args.status, search: args.search, includeDrafts: true }),
    cmsPage: (
      _: unknown,
      args: { id?: string; slug?: string },
    ) => {
      const numericId = toNumber(args.id)
      if (numericId !== undefined) {
        return CmsService.getById(numericId)
      }
      if (args.slug) {
        return CmsService.getBySlug(args.slug, { includeDrafts: true })
      }
      return null
    },
  },

  CustomerSupportMutation: {
    createCmsPage: (
      _: unknown,
      { input }: { input: { slug: string; title: string; excerpt?: string | null; body: string; status?: CmsStatus; publishedAt?: string | null } },
    ) => {
      validateInput(input, {
        slug: { required: true, type: 'string' },
        title: { required: true, type: 'string' },
        body: { required: true, type: 'string' },
      })
      return CmsService.create(input)
    },

    updateCmsPage: (
      _: unknown,
      { id, input }: { id: string; input: { slug?: string; title?: string; excerpt?: string | null; body?: string; status?: CmsStatus; publishedAt?: string | null } },
    ) => {
      validateInput({ id }, { id: { required: true, type: 'string' } })
      const numericId = toNumber(id)
      if (numericId === undefined) {
        throw new Error('Invalid CMS page id')
      }
      return CmsService.update(numericId, input)
    },

    publishCmsPage: (_: unknown, { id }: { id: string }) => {
      const numericId = toNumber(id)
      if (numericId === undefined) {
        throw new Error('Invalid CMS page id')
      }
      return CmsService.publish(numericId)
    },

    deleteCmsPage: (_: unknown, { id }: { id: string }) => {
      const numericId = toNumber(id)
      if (numericId === undefined) {
        throw new Error('Invalid CMS page id')
      }
      return CmsService.remove(numericId)
    },
  },
}
