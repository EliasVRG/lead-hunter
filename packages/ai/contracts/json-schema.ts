/**
 * Tipo mínimo de JSON Schema aceito pelos structured outputs do OpenRouter.
 *
 * O OpenRouter exige, no modo `strict`, que todo objeto declare
 * `additionalProperties: false` e liste **todas** as suas propriedades em
 * `required` — campos opcionais devem ser modelados como união com `null`.
 * Os helpers abaixo montam os schemas já respeitando essa restrição, para não
 * depender de um gerador zod→JSON Schema que produz output incompatível.
 */
export interface JsonSchema {
  type?: string | string[];
  description?: string;
  enum?: readonly string[];
  minimum?: number;
  maximum?: number;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  maxItems?: number;
  minItems?: number;
}

export interface ResponseFormatJsonSchema {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: true;
    schema: JsonSchema;
  };
}

/** Objeto fechado: toda propriedade é obrigatória, nada extra é aceito. */
export function strictObject(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export function integerRange(minimum: number, maximum: number, description: string): JsonSchema {
  return { type: "integer", minimum, maximum, description };
}

export function stringField(description: string): JsonSchema {
  return { type: "string", description };
}

export function stringArray(description: string, maxItems?: number): JsonSchema {
  return { type: "array", description, items: { type: "string" }, ...(maxItems ? { maxItems } : {}) };
}

export function enumField(values: readonly string[], description: string): JsonSchema {
  return { type: "string", enum: values, description };
}

export function nullableNumber(description: string): JsonSchema {
  return { type: ["number", "null"], description };
}

export function responseFormat(name: string, schema: JsonSchema): ResponseFormatJsonSchema {
  return { type: "json_schema", json_schema: { name, strict: true, schema } };
}
