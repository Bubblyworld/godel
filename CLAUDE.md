# Gödel TypeScript Theorem Prover - Developer Cheatsheet

## Quick Overview
A theorem prover for first-order logic written in TypeScript, designed to demonstrate the feasibility of high-level language implementations. The project centers around Gödel's incompleteness theorems and implements a resolution-based refutation algorithm.

## Architecture

### Core Components

1. **AST (`src/ast.ts`)** - Abstract syntax tree for first-order logic
   - `Term`: Variables, constants, and function applications
   - `Formula`: Atoms, logical connectives (¬,∧,∨,→), and quantifiers (∀,∃)
   - `SymbolTable`: Maps symbolic names to indices with type safety
   - Transform utilities for AST manipulation

2. **Parser (`src/parse.ts`)** - Formula parsing and rendering
   - Tokenizer supports both ASCII and Unicode operators
   - Operator precedence: NOT > OR > AND > IMPLIES > QUANTIFIERS
   - Variable naming convention: `x,y,z,u,v,w` are variables by default
   - Pretty-printing with proper parenthesization

3. **CNF Converter (`src/cnf.ts`)** - Conjunctive Normal Form transformation
   - Pipeline: implications → push negations → remove double negations → freshen quantifiers → move quantifiers out → skolemize → distribute OR over AND
   - Skolemization creates fresh function symbols for existential quantifiers
   - Produces equisatisfiable formulas suitable for resolution

4. **Resolution Engine (`src/resolution.ts`)** - Core proving mechanism
   - Converts CNF formulas to clause sets
   - Implements binary resolution with unification
   - Support-set strategy (SOS) for goal-directed search
   - Preference for unit resolutions when available

5. **Unification (`src/unify.ts`)** - Syntactic unification
   - Martelli-Montanari algorithm implementation
   - Handles substitutions with proper variable binding
   - Used for finding compatible atoms in resolution

6. **Prover (`src/prover.ts`)** - Main theorem proving interface
   - `proves(theory, formula, symbolTable, iterations)` - attempts to prove formula from theory
   - Uses refutation: proves by showing ¬formula leads to contradiction
   - Iterative deepening with clause size tracking

7. **Peano Arithmetic (`src/peano.ts`)** - Example theory
   - Implements basic arithmetic axioms (successor, addition, multiplication)
   - TODO: Axiom schema of induction not yet implemented

## Development Commands

```bash
# Install dependencies
yarn install

# Build TypeScript
yarn build

# Watch mode for development  
yarn dev

# Run tests
yarn test
yarn test:watch

# Linting and formatting
yarn lint
yarn lint:fix
yarn format
yarn typecheck

# CLI usage
yarn build && node dist/cli.js parse "forall x. P(x) -> Q(x)"
yarn build && node dist/cli.js cnf "exists x. P(x) & (Q(x) | R(x))"
```

## Formula Syntax

### Operators
- Negation: `!` or `¬`
- Conjunction: `&` or `∧`
- Disjunction: `|` or `∨`
- Implication: `->` or `→`
- Universal: `forall x.` or `∀x.`
- Existential: `exists x.` or `∃x.`

### Examples
```
∀x.P(x) → Q(x)
∃x,y.(P(x) ∧ Q(y))
∀x.(P(x) → ∃y.R(x,y))
```

## Key Implementation Details

### Symbol Table Design
- Uses JavaScript symbols for uniqueness
- Separate namespaces for variables, constants, functions, and relations
- Bidirectional mapping between symbols and indices
- Type-safe resolution with error handling

### CNF Transformation Pipeline
1. **Transform implications**: A→B becomes ¬A∨B
2. **Push negations down**: De Morgan's laws, quantifier duality
3. **Remove double negations**: ¬¬A becomes A
4. **Freshen quantifiers**: Ensure unique variable names
5. **Move quantifiers outside**: Prenex normal form
6. **Skolemize existentials**: Replace ∃ with Skolem functions
7. **Distribute OR over AND**: Final CNF form
8. **Remove leading universals**: Free variables are implicitly universal

### Resolution Strategy
- Binary resolution with full unification
- Support-set (SOS) strategy keeps goal-derived clauses separate
- Prefers unit resolutions when available
- Iterative deepening with configurable depth limit
- Early termination on empty clause (proof found)

## Testing

Tests use Mocha + Chai and cover:
- AST construction and manipulation
- Formula parsing and rendering
- CNF conversion steps
- Unification algorithm
- Resolution inference
- Peano arithmetic axioms

Run specific test files:
```bash
npx mocha src/ast.test.ts
npx mocha src/cnf.test.ts
npx mocha src/resolution.test.ts
```

## Future Work

1. **Axiom schema of induction** - Critical for Peano arithmetic completeness
2. **Performance optimization** - Incremental hashing, better indexing
3. **Proof extraction** - Track resolution steps for proof reconstruction
4. **CLI improvements** - Better error messages, interactive mode
5. **Port to Rust/C** - Long-term goal for production performance

## Common Patterns

### Adding a new theory
```typescript
const st = createSymbolTable();
const axiom1 = parseFormula('...', st);
const axiom2 = parseFormula('...', st);
const theory = [axiom1, axiom2, ...];

const goal = parseFormula('...', st);
const isProven = proves(theory, goal, st);
```

### Debugging CNF conversion
```typescript
const f = parseFormula('...', st);
console.log('Original:', renderFormula(f, st));
const cnf = toCNF(f, st);
console.log('CNF:', renderFormula(cnf, st));
```

### Manual resolution
```typescript
const clauses = cnfToClauses(toCNF(formula, st));
const resolutions = getResolutions(clauses[0], clauses[1]);
const newClause = applyResolution(resolutions[0]);
```

## Architecture Philosophy

The design prioritizes clarity and correctness over performance:
- Immutable AST nodes
- Explicit symbol table management  
- Clear separation between syntax and semantics
- Comprehensive test coverage
- TypeScript's type system for safety

This makes the codebase ideal for experimentation and learning, with the understanding that a production implementation would require significant optimization.

## Comment Style Guidelines

### Core Principles
- **Focus on "why" not "how"**: Comments should explain the reasoning, mathematical concepts, or edge cases, not describe what the code mechanically does
- **Use proper notation**: Feel free to use mathematical/logical notation (∧, ∨, ¬, ∀, ∃, →, ⊆, etc.) to clarify concepts
- **Be concise**: Comments should be brief and to the point, avoiding redundancy with self-evident code
- **Maintain technical accuracy**: Reference specific algorithms or theoretical concepts when relevant

### Comment Types

1. **JSDoc for public API**: All exported types, interfaces, and functions should have JSDoc comments
   ```typescript
   /**
    * Attempts to prove a formula from a theory using resolution-based refutation.
    * Uses the given-clause algorithm with subsumption checking to manage the search space.
    */
   ```

2. **Inline type member comments**: Use single-line comments after type members
   ```typescript
   export const enum NodeKind {
     Var,    // variable term x
     Const,  // constant term c
   }
   ```

3. **Implementation comments**: Explain non-obvious decisions or algorithmic steps
   ```typescript
   // Refutation: prove by showing theory ∧ ¬formula is unsatisfiable
   // Forward subsumption: is selected clause redundant?
   // SOS restriction: only keep resolvents if at least one parent was goal-derived
   ```

4. **Section markers**: Use comments to delineate logical sections of complex functions
   ```typescript
   // Forward subsumption check
   // Backward subsumption
   // Progress logging
   ```

### What NOT to Comment
- Don't state the obvious: `// increment counter` is unnecessary
- Don't repeat what types/function names already convey
- Don't over-explain standard algorithms to readers assumed familiar with the domain

### Development Best Practices
- **Minimize feedback loops**: Always implement against test cases when possible. Write tests first or ensure tests exist before making changes
- **Use the type system**: Let TypeScript's types document the code structure; comments should add semantic meaning the types can't convey
- **Informal tone acceptable**: Occasional casual language is fine if it aids understanding (e.g., "NP-completeness is a bitch")

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.