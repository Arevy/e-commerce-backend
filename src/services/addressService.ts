// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../config/database'
import { Address } from '../models/address'

const mapAddressRow = (row: any[]): Address => ({
  id: row[0],
  userId: row[1],
  street: row[2],
  city: row[3],
  postalCode: row[4],
  country: row[5],
})

const fetchAddressById = async (addressId: number) => {
  const conn = await getConnectionFromPool()
  try {
    const res = await conn.execute(
      `SELECT ID, USER_ID, STREET, CITY, POSTAL_CODE, COUNTRY
         FROM ADDRESSES WHERE ID = :aid`,
      { aid: addressId },
    )
    if (!res.rows?.length) {
      return null
    }
    return mapAddressRow(res.rows[0] as any[])
  } finally {
    await conn.close()
  }
}

export const AddressService = {
  getByUser: async (userId: number): Promise<Address[]> => {
    const conn = await getConnectionFromPool()
    try {
      const res = await conn.execute(
        `SELECT ID, USER_ID, STREET, CITY, POSTAL_CODE, COUNTRY
           FROM ADDRESSES WHERE USER_ID=:uid
          ORDER BY ID`,
        { uid: userId },
      )
      return (res.rows || []).map((row: any[]) => mapAddressRow(row))
    } finally {
      await conn.close()
    }
  },

  add: async (
    userId: number,
    street: string,
    city: string,
    postalCode: string,
    country: string,
  ): Promise<Address> => {
    const conn = await getConnectionFromPool()
    let addressId: number | null = null
    try {
      const res = await conn.execute(
        `INSERT INTO ADDRESSES (USER_ID, STREET, CITY, POSTAL_CODE, COUNTRY)
         VALUES (:uid,:str,:cit,:zip,:cn)
         RETURNING ID INTO :aid`,
        {
          uid: userId,
          str: street,
          cit: city,
          zip: postalCode,
          cn: country,
          aid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: true },
      )
      addressId = (res.outBinds as any).aid[0]
    } finally {
      await conn.close()
    }

    if (!addressId) {
      throw new Error('Failed to create address')
    }

    const created = await fetchAddressById(addressId)
    if (!created) {
      throw new Error('Failed to load created address')
    }
    return created
  },

  update: async (
    addressId: number,
    street?: string,
    city?: string,
    postalCode?: string,
    country?: string,
  ): Promise<Address> => {
    const conn = await getConnectionFromPool()
    try {
      const fields: string[] = []
      const params: Record<string, unknown> = { addressId }

      if (street !== undefined) {
        fields.push('STREET = :street')
        params.street = street
      }
      if (city !== undefined) {
        fields.push('CITY = :city')
        params.city = city
      }
      if (postalCode !== undefined) {
        fields.push('POSTAL_CODE = :postalCode')
        params.postalCode = postalCode
      }
      if (country !== undefined) {
        fields.push('COUNTRY = :country')
        params.country = country
      }

      if (!fields.length) {
        throw new Error('Nothing to update for address')
      }

      const res = await conn.execute(
        `UPDATE ADDRESSES SET ${fields.join(', ')} WHERE ID = :addressId`,
        params,
        { autoCommit: true },
      )
      if (!res.rowsAffected) {
        throw new Error(`Address ${addressId} not found`)
      }
    } finally {
      await conn.close()
    }

    const updated = await fetchAddressById(addressId)
    if (!updated) {
      throw new Error(`Address ${addressId} not found after update`)
    }
    return updated
  },

  delete: async (addressId: number): Promise<boolean> => {
    const conn = await getConnectionFromPool()
    try {
      const res = await conn.execute(
        `DELETE FROM ADDRESSES WHERE ID = :aid`,
        { aid: addressId },
        { autoCommit: true },
      )
      return (res.rowsAffected || 0) > 0
    } finally {
      await conn.close()
    }
  },
}
