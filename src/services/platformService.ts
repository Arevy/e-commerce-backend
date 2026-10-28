import { getConnectionFromPool } from '../config/database'
import { Experience, validateExperience } from './platformCustomization'

export interface PlatformConfiguration {
  platformId: string
  revision: number
  displayName: string
  locale: string
  currency: 'EUR'
  priceDisplay: 'gross'
  branding: { accent: string; background: string; surface: string }
  experience?: Experience
}

export function validatePlatformConfiguration(
  value: unknown,
): PlatformConfiguration {
  const c = value as PlatformConfiguration
  if (
    !c ||
    !/^sx_[a-f0-9]{12}$/.test(c.platformId) ||
    !Number.isSafeInteger(c.revision) ||
    c.revision < 1 ||
    typeof c.displayName !== 'string' ||
    !c.displayName.trim() ||
    c.displayName.length > 80 ||
    !['en', 'ro', 'de', 'fr', 'ar', 'he'].includes(c.locale) ||
    c.currency !== 'EUR' ||
    c.priceDisplay !== 'gross' ||
    !['accent', 'background', 'surface'].every((key) =>
      /^#[a-fA-F0-9]{6}$/.test(c.branding?.[key as keyof typeof c.branding]),
    )
  ) {
    throw new Error('Invalid platform configuration')
  }
  return {
    platformId: c.platformId,
    revision: c.revision,
    displayName: c.displayName.trim(),
    locale: c.locale,
    currency: c.currency,
    priceDisplay: c.priceDisplay,
    branding: {
      accent: c.branding.accent,
      background: c.branding.background,
      surface: c.branding.surface,
    },
    ...(c.experience === undefined
      ? {}
      : { experience: validateExperience(c.experience) }),
  }
}

export async function getPlatformConfiguration(): Promise<PlatformConfiguration | null> {
  const identity = process.env.PLATFORM_ID
  if (!identity) return null
  const connection = await getConnectionFromPool()
  try {
    const result = await connection.execute(
      'SELECT CONFIGURATION FROM SHOPX_PLATFORM_CONFIG WHERE ID=1',
    )
    const row = result.rows?.[0] as [string] | undefined
    const config = validatePlatformConfiguration(
      row ? JSON.parse(row[0]) : null,
    )
    if (config.platformId !== identity)
      throw new Error('Platform identity mismatch')
    return config
  } finally {
    await connection.close()
  }
}
