import { CategoryService } from '../../services/categoryService'

export const categoryResolver = {
  Query: {
    getCategories: (_: any, args: any) =>
      CategoryService.getAll(args.limit, args.offset, args.name),
  },

  Mutation: {
    addCategory: (_: any, { name, description }: any) =>
      CategoryService.add(name, description),
    updateCategory: (_: any, { id, name, description }: any) =>
      CategoryService.update(id, name, description),
    deleteCategory: (_: any, { id }: any) => CategoryService.delete(id),
  },
}
