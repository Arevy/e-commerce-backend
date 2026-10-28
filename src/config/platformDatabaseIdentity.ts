// A managed backend must never serve another shop's schema, even after a bad deployment config.
export function assertPlatformDatabaseIdentity(
  platformId: string | undefined,
  sessionUser: string,
  currentSchema: string,
  isDba: string,
  dbaRoles = 0,
) {
  if (!platformId) return
  if (!/^sx_[a-f0-9]{12}$/.test(platformId)) {
    throw new Error('Invalid platform database identity')
  }
  const expected = platformId.replace('sx_', 'SX_P_').toUpperCase()
  if (
    sessionUser !== expected ||
    currentSchema !== expected ||
    isDba !== 'FALSE' ||
    dbaRoles !== 0
  ) {
    throw new Error('Platform database identity mismatch')
  }
}
