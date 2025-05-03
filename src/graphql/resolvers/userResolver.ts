import { UserService } from '../../services/userService'
import { RegisterArgs, LoginArgs } from '../types/args'

export const userResolver = {
  Query: {
    getUsers: () => UserService.getAll(),
  },

  Mutation: {
    register: (_: any, args: RegisterArgs) =>
      UserService.register(args.email, args.password, args.name),

    login: (_: any, args: LoginArgs) =>
      UserService.login(args.email, args.password),
  },
}
