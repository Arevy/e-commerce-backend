export type UserRole = 'CUSTOMER' | 'SUPPORT'

export interface User {
  id: number
  email: string
  name?: string | null
  role: UserRole
}
