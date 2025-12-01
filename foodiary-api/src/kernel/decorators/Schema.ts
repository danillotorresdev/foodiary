import { z } from 'zod';

const SCHEMA_METADATA_KEY = 'custom:schema';

/**
 * Decorador que associa um schema Zod a uma classe.
 *
 * Este decorador utiliza reflexão para armazenar um schema de validação Zod
 * como metadado da classe decorada, permitindo validação posterior dos dados.
 *
 * @param schema - O schema Zod que será usado para validar instâncias da classe decorada
 * @returns Um decorador de classe que armazena o schema como metadado
 *
 * @example
 * ```typescript
 * @Schema(z.object({ name: z.string() }))
 * class Usuario {
 *   name: string;
 * }
 * ```
 */
export function Schema(schema: z.ZodSchema): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(SCHEMA_METADATA_KEY, schema, target);
  };
}

/**
 * Obtém o schema Zod associado a uma classe através de metadados de reflexão.
 *
 * @param target - A instância do objeto ou classe da qual se deseja obter o schema
 * @returns O schema Zod associado à classe, ou undefined se nenhum schema foi definido
 *
 * @example
 * ```typescript
 * const schema = getSchema(minhaInstancia);
 * if (schema) {
 *   schema.parse(dados);
 * }
 * ```
 */
export function getSchema(target: any): z.ZodSchema | undefined {
  return Reflect.getMetadata(SCHEMA_METADATA_KEY, target.constructor);
}
