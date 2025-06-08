import { Formula, NodeKind, transform, TransformFns } from "./ast";

/**
 * Converts all instances of A→B to ¬A∨B.
 */
export function transformImpliesToOr(f: Formula): Formula {
  const cbs: TransformFns = {
    Implies: f => ({
      kind: NodeKind.Or,
      right: transform(f.right, cbs),
      left: {
        kind: NodeKind.Not,
        arg: transform(f.left, cbs),
      },
    }),
  };

  return transform(f, cbs);
}
