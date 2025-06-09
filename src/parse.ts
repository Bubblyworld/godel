import {
  Formula,
  Term,
  NodeKind,
  SymbolTable,
  add,
  SymbolKind,
  resolve,
  SymbolEntry,
} from './ast';

/**
 * Token types for the lexer.
 */
export enum TokenKind {
  // Literals
  IDENTIFIER = 'IDENTIFIER',

  // Operators – precedence (highest ➜ lowest): NOT > OR > AND > IMPLIES > (QUANTIFIERS)
  NOT = 'NOT', // ! ¬
  OR = 'OR', // | ∨  (clause‑first, binds *tighter* than ∧)
  AND = 'AND', // & ∧
  IMPLIES = 'IMPLIES', // -> → (right‑associative)

  // Quantifiers (weakest – bind the *loosest*)
  FORALL = 'FORALL', // forall ∀
  EXISTS = 'EXISTS', // exists ∃

  // Punctuation
  LPAREN = 'LPAREN', // (
  RPAREN = 'RPAREN', // )
  COMMA = 'COMMA', // ,
  DOT = 'DOT', // .

  // Special
  EOF = 'EOF',
}

export interface Token {
  kind: TokenKind;
  value: string;
  pos: number;
}

export class Lexer {
  private pos = 0;
  private current = '';
  constructor(private readonly input: string) {
    this.advance();
  }

  private advance(): void {
    this.current =
      this.pos < this.input.length ? this.input.charAt(this.pos++) : '';
  }
  private peek(): string {
    return this.pos < this.input.length ? this.input.charAt(this.pos) : '';
  }
  private skipWs(): void {
    while (this.current && /\s/.test(this.current)) this.advance();
  }

  private readIdentifier(): string {
    let out = '';
    while (this.current && /[A-Za-z0-9_]/.test(this.current)) {
      out += this.current;
      this.advance();
    }
    return out;
  }

  public nextToken(): Token {
    this.skipWs();
    if (!this.current) return { kind: TokenKind.EOF, value: '', pos: this.pos };
    const start = this.pos - 1;

    switch (this.current) {
      case '(':
        this.advance();
        return { kind: TokenKind.LPAREN, value: '(', pos: start };
      case ')':
        this.advance();
        return { kind: TokenKind.RPAREN, value: ')', pos: start };
      case ',':
        this.advance();
        return { kind: TokenKind.COMMA, value: ',', pos: start };
      case '.':
        this.advance();
        return { kind: TokenKind.DOT, value: '.', pos: start };
      case '!':
      case '¬':
        this.advance();
        return {
          kind: TokenKind.NOT,
          value: this.input.charAt(start),
          pos: start,
        };
      case '|':
      case '∨':
        this.advance();
        return {
          kind: TokenKind.OR,
          value: this.input.charAt(start),
          pos: start,
        };
      case '&':
      case '∧':
        this.advance();
        return {
          kind: TokenKind.AND,
          value: this.input.charAt(start),
          pos: start,
        };
      case '→':
        this.advance();
        return { kind: TokenKind.IMPLIES, value: '→', pos: start };
      case '∀':
        this.advance();
        return { kind: TokenKind.FORALL, value: '∀', pos: start };
      case '∃':
        this.advance();
        return { kind: TokenKind.EXISTS, value: '∃', pos: start };
    }

    if (this.current === '-' && this.peek() === '>') {
      this.advance();
      this.advance();
      return { kind: TokenKind.IMPLIES, value: '->', pos: start };
    }

    if (/[A-Za-z]/.test(this.current)) {
      const id = this.readIdentifier();
      switch (id.toLowerCase()) {
        case 'forall':
          return { kind: TokenKind.FORALL, value: id, pos: start };
        case 'exists':
          return { kind: TokenKind.EXISTS, value: id, pos: start };
        default:
          return { kind: TokenKind.IDENTIFIER, value: id, pos: start };
      }
    }

    throw new Error(
      `Unexpected character '${this.current}' at position ${start}`
    );
  }
}

export class Parser {
  private current = 0;
  private readonly tokens: Token[] = [];
  private readonly bindings: Map<string, SymbolEntry> = new Map();

  constructor(
    lexer: Lexer,
    private readonly st: SymbolTable
  ) {
    let t;
    do {
      t = lexer.nextToken();
      this.tokens.push(t);
    } while (t.kind !== TokenKind.EOF);

    // existing bindings for all symbol types
    for (const c of st.consts) {
      const name = c.symbol.description!;
      if (!this.bindings.has(name)) {
        this.bindings.set(name, c);
      }
    }
    for (const f of st.funs) {
      const name = f.symbol.description!;
      if (!this.bindings.has(name)) {
        this.bindings.set(name, f);
      }
    }
    for (const r of st.rels) {
      const name = r.symbol.description!;
      if (!this.bindings.has(name)) {
        this.bindings.set(name, r);
      }
    }
    for (const v of st.vars) {
      const name = v.symbol.description!;
      if (!this.bindings.has(name)) {
        this.bindings.set(name, v);
      }
    }
  }

  private peek(): Token {
    return (
      this.tokens[this.current] ?? {
        kind: TokenKind.EOF,
        value: '',
        pos: this.tokens.at(-1)?.pos ?? -1,
      }
    );
  }

  private advance(): Token {
    const tok = this.peek();
    if (tok.kind !== TokenKind.EOF) this.current++;
    return tok;
  }

  private match(...k: TokenKind[]): boolean {
    return k.includes(this.peek().kind);
  }

  private expect(kind: TokenKind): Token {
    if (!this.match(kind))
      throw new Error(`Expected ${kind} at ${this.peek().pos}`);
    return this.advance();
  }

  private expectBinding(
    name: string,
    ...kinds: SymbolKind[]
  ): SymbolEntry | undefined {
    const b = this.bindings.get(name);
    if (!b) return undefined;
    if (!kinds.includes(b.kind))
      throw new Error(
        `Identifier ${name} already bound as different symbol kind`
      );
    return b;
  }

  public parseFormula(): Formula {
    const f = this.parseImplication();
    if (this.peek().kind !== TokenKind.EOF)
      throw new Error(
        `Unexpected '${this.peek().value}' at ${this.peek().pos}`
      );
    return f;
  }

  private parseImplication(): Formula {
    let left = this.parseAnd();
    while (this.match(TokenKind.IMPLIES)) {
      this.advance();
      const right = this.parseImplication(); // right‑associative
      left = { kind: NodeKind.Implies, left, right };
    }
    return left;
  }

  private parseAnd(): Formula {
    let left = this.parseOr();
    while (this.match(TokenKind.AND)) {
      this.advance();
      const right = this.parseOr();
      left = { kind: NodeKind.And, left, right };
    }
    return left;
  }

  private parseOr(): Formula {
    let left = this.parseNegation();
    while (this.match(TokenKind.OR)) {
      this.advance();
      const right = this.parseNegation();
      left = { kind: NodeKind.Or, left, right };
    }
    return left;
  }

  private parseNegation(): Formula {
    if (this.match(TokenKind.NOT)) {
      this.advance();
      return { kind: NodeKind.Not, arg: this.parseNegation() };
    }
    return this.parseQuantified();
  }

  private parseQuantified(): Formula {
    if (this.match(TokenKind.FORALL, TokenKind.EXISTS)) {
      const token = this.advance();
      const names = this.parseVariableList();
      const vars = names.map((name) => {
        let existingVar: SymbolEntry | undefined;
        try {
          existingVar = this.expectBinding(name, SymbolKind.Var);
        } catch (err) {
          // already bound but not a variable
        }

        return existingVar ?? add(this.st, SymbolKind.Var, Symbol(name));
      });

      this.expect(TokenKind.DOT);

      const originalBindings = new Map<string, SymbolEntry>();
      for (const v of vars) {
        const name = v.symbol.description!;
        const original = this.bindings.get(name);
        if (original) {
          originalBindings.set(name, original);
        }
        this.bindings.set(name, v);
      }

      const body = this.parseQuantified();

      for (const v of vars) {
        const name = v.symbol.description!;
        const original = originalBindings.get(name);
        if (original) {
          this.bindings.set(name, original);
        } else {
          this.bindings.delete(name);
        }
      }

      const idxs = vars.map((v) => v.idx);
      return token.kind === TokenKind.FORALL
        ? { kind: NodeKind.ForAll, vars: idxs, arg: body }
        : { kind: NodeKind.Exists, vars: idxs, arg: body };
    }
    return this.parseAtom();
  }

  private parseVariableList(): string[] {
    const names: string[] = [];
    names.push(this.expect(TokenKind.IDENTIFIER).value);
    while (this.match(TokenKind.COMMA)) {
      this.advance();
      names.push(this.expect(TokenKind.IDENTIFIER).value);
    }
    return names;
  }

  private parseAtom(): Formula {
    if (this.match(TokenKind.LPAREN)) return this.parseParenthesised();
    if (this.match(TokenKind.IDENTIFIER)) {
      const nameTok = this.advance();
      const id = nameTok.value;
      const args: Term[] = [];

      if (this.match(TokenKind.LPAREN)) {
        this.advance();
        if (!this.match(TokenKind.RPAREN)) {
          args.push(this.parseTerm());
          while (this.match(TokenKind.COMMA)) {
            this.advance();
            args.push(this.parseTerm());
          }
        }
        this.expect(TokenKind.RPAREN);
        const rel =
          this.expectBinding(id, SymbolKind.Rel) ??
          add(this.st, SymbolKind.Rel, Symbol(id), args.length);
        this.bindings.set(id, rel);
        return { kind: NodeKind.Atom, idx: rel.idx, args };
      }

      const rel =
        this.expectBinding(id, SymbolKind.Rel) ??
        add(this.st, SymbolKind.Rel, Symbol(id), 0);
      this.bindings.set(id, rel);
      return { kind: NodeKind.Atom, idx: rel.idx, args: [] };
    }
    throw new Error(`Expected atom at ${this.peek().pos}`);
  }

  private parseParenthesised(): Formula {
    this.expect(TokenKind.LPAREN);
    const f = this.parseImplication();
    this.expect(TokenKind.RPAREN);
    return f;
  }

  private parseTerm(): Term {
    if (!this.match(TokenKind.IDENTIFIER))
      throw new Error(`Expected term at ${this.peek().pos}`);
    const id = this.advance().value;

    if (this.match(TokenKind.LPAREN)) {
      this.advance();
      const args: Term[] = [];
      if (!this.match(TokenKind.RPAREN)) {
        args.push(this.parseTerm());
        while (this.match(TokenKind.COMMA)) {
          this.advance();
          args.push(this.parseTerm());
        }
      }
      this.expect(TokenKind.RPAREN);
      const func =
        this.expectBinding(id, SymbolKind.Fun) ??
        add(this.st, SymbolKind.Fun, Symbol(id), args.length);
      this.bindings.set(id, func);
      return { kind: NodeKind.FunApp, idx: func.idx, args };
    }

    // standalone identifier → variable *or* constant depending on syntax
    const bound = this.expectBinding(id, SymbolKind.Var, SymbolKind.Const);
    if (bound) {
      return bound.kind === SymbolKind.Var
        ? { kind: NodeKind.Var, idx: bound.idx }
        : { kind: NodeKind.Const, idx: bound.idx };
    }

    if (looksLikeVariable(id)) {
      const v = add(this.st, SymbolKind.Var, Symbol(id));
      this.bindings.set(id, v);
      return { kind: NodeKind.Var, idx: v.idx };
    }

    const c = add(this.st, SymbolKind.Const, Symbol(id));
    this.bindings.set(id, c);
    return { kind: NodeKind.Const, idx: c.idx };
  }
}

/**
 * Parses a formula into the given symbol table.
 */
export function parseFormula(input: string, st: SymbolTable): Formula {
  return new Parser(new Lexer(input), st).parseFormula();
}

/**
 * Precedence map for *rendering* (used to decide when brackets are needed).
 * It must mirror the parsing precedence defined above.
 */
const PREC = {
  [NodeKind.Implies]: 1,
  [NodeKind.And]: 2,
  [NodeKind.Or]: 3,
  [NodeKind.Not]: 4,
} as const;

function needsParens(child: Formula, parent: Formula): boolean {
  const cp = PREC[child.kind as keyof typeof PREC];
  const pp = PREC[parent.kind as keyof typeof PREC];
  if (cp === undefined || pp === undefined) return false;
  if (cp < pp) return true; // lower precedence needs parentheses
  if (cp === pp) {
    // Implication is right‑associative – need parens around *left* child
    if (parent.kind === NodeKind.Implies && (parent as any).left === child)
      return true;
    // AND / OR are left‑associative – need parens around *right* child when same kind
    if (
      (parent.kind === NodeKind.And || parent.kind === NodeKind.Or) &&
      (parent as any).right === child &&
      child.kind === parent.kind
    )
      return true;
  }
  return false;
}

export function renderTerm(t: Term, st: SymbolTable): string {
  switch (t.kind) {
    case NodeKind.Var:
      return (
        resolve(SymbolKind.Var, t.idx, st).symbol.description ?? `v${t.idx}`
      );
    case NodeKind.Const:
      return (
        resolve(SymbolKind.Const, t.idx, st).symbol.description ?? `c${t.idx}`
      );
    case NodeKind.FunApp: {
      const fn =
        resolve(SymbolKind.Fun, t.idx, st).symbol.description ?? `f${t.idx}`;
      return t.args.length
        ? `${fn}(${t.args.map((a) => renderTerm(a, st)).join(', ')})`
        : fn;
    }
  }
}

export function renderFormula(f: Formula, st: SymbolTable): string {
  const rec = (phi: Formula, parent?: Formula): string => {
    const paren = parent && needsParens(phi, parent);
    let out: string;
    switch (phi.kind) {
      case NodeKind.Atom: {
        const rel =
          resolve(SymbolKind.Rel, phi.idx, st).symbol.description ??
          `R${phi.idx}`;
        out = phi.args.length
          ? `${rel}(${phi.args.map((a) => renderTerm(a, st)).join(', ')})`
          : rel;
        break;
      }
      case NodeKind.Not:
        out = `¬${rec(phi.arg, phi)}`;
        break;
      case NodeKind.Or:
        out = `${rec(phi.left, phi)} ∨ ${rec(phi.right, phi)}`;
        break;
      case NodeKind.And:
        out = `${rec(phi.left, phi)} ∧ ${rec(phi.right, phi)}`;
        break;
      case NodeKind.Implies:
        out = `${rec(phi.left, phi)} → ${rec(phi.right, phi)}`;
        break;
      case NodeKind.ForAll: {
        const vars = phi.vars
          .map(
            (i) => resolve(SymbolKind.Var, i, st).symbol.description ?? `v${i}`
          )
          .join(',');
        const body =
          phi.arg.kind === NodeKind.Atom ? rec(phi.arg) : `(${rec(phi.arg)})`;
        out = `∀${vars}.${body}`;
        break;
      }
      case NodeKind.Exists: {
        const vars = phi.vars
          .map(
            (i) => resolve(SymbolKind.Var, i, st).symbol.description ?? `v${i}`
          )
          .join(',');
        const body =
          phi.arg.kind === NodeKind.Atom ? rec(phi.arg) : `(${rec(phi.arg)})`;
        out = `∃${vars}.${body}`;
        break;
      }
      default:
        const _exhaustive: never = phi;
        throw new Error(`Unknown formula kind ${_exhaustive}`);
    }
    return paren ? `(${out})` : out;
  };
  return rec(f);
}

/**
 * Return `true` if the identifier should be treated as a *variable* by
 * syntactic convention when it is not already bound by a quantifier.
 */
function looksLikeVariable(name: string): boolean {
  return /^[uvwxyz](\d*)$/.test(name);
}
