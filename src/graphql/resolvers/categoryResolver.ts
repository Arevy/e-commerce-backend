import { CategoryService } from '../../services/categoryService'

export const categoryResolver = {
  Query: {
    getCategories: (_: unknown, args: any) =>
      CategoryService.getAll(args.limit, args.offset, args.name),
  },

  Mutation: {
    addCategory: (_: unknown, { name, description }: any) =>
      CategoryService.add(name, description),
    updateCategory: (_: unknown, { id, name, description }: any) =>
      CategoryService.update(Number(id), name, description),
    deleteCategory: (_: unknown, { id }: any) =>
      CategoryService.delete(Number(id)),
  },
}
