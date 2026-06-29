import type {
  Capability,
  JsonSchema,
  PermissionRequest,
  Result,
  Tool,
  ToolContext,
  ToolError,
} from '@forgewright/types';
import { err, ok } from '@forgewright/types';
import { type z, type ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface ToolDefinition<S extends ZodType, O> {
  readonly name: string;
  readonly description: string;
  readonly capability: Capability;
  /** Zod schema; its inferred output type becomes the tool's input type. */
  readonly input: S;
  /** Describe the permission request for given input (target, destructiveness). */
  readonly describe?: (input: z.infer<S>) => Omit<PermissionRequest, 'capability'>;
  readonly run: (input: z.infer<S>, ctx: ToolContext) => Promise<O>;
}

/**
 * Build a {@link Tool} from a Zod schema. Input is validated via Zod, and the
 * JSON Schema exposed to the LLM is derived from the same schema — single source
 * of truth, no drift. The tool's input type is inferred from the schema.
 */
export const defineTool = <S extends ZodType, O>(
  def: ToolDefinition<S, O>,
): Tool<z.infer<S>, O> => {
  const jsonSchema = zodToJsonSchema(def.input, { target: 'jsonSchema7' }) as JsonSchema;
  type I = z.infer<S>;

  return {
    name: def.name,
    description: def.description,
    capability: def.capability,
    schema: jsonSchema,
    parse(raw: unknown): Result<I, ToolError> {
      const parsed = def.input.safeParse(raw);
      if (parsed.success) return ok(parsed.data as I);
      const issue = parsed.error.issues[0];
      const path = issue?.path.join('.') ?? '';
      return err({
        code: 'TOOL_INPUT_INVALID',
        message: `${def.name}: ${issue?.message ?? 'invalid input'}${path ? ` (at "${path}")` : ''}`,
      });
    },
    describe(input: I): PermissionRequest {
      const described = def.describe?.(input) ?? { summary: def.name };
      return { capability: def.capability, ...described };
    },
    execute(input: I, ctx: ToolContext): Promise<O> {
      return def.run(input, ctx);
    },
  };
};
