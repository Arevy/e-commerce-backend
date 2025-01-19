export const validateInput = (input: any, schema: any) => {
  for (const key in schema) {
    if (
      schema[key].required &&
      (input[key] === null || input[key] === undefined)
    ) {
      throw new Error(`${key} is required`)
    }
    if (schema[key].type && typeof input[key] !== schema[key].type) {
      throw new Error(`${key} must be of type ${schema[key].type}`)
    }
  }
}
