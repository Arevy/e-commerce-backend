export const validateInput = (input: any, schema: any) => {
  for (const key in schema) {
    const value = input[key]
    const rules = schema[key]

    if (rules.required && (value === null || value === undefined)) {
      throw new Error(`${key} is required`)
    }

    if (
      rules.type &&
      value !== null &&
      value !== undefined &&
      typeof value !== rules.type
    ) {
      throw new Error(`${key} must be of type ${rules.type}`)
    }
  }
}
