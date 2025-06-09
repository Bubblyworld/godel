import { Formula, Term, NodeKind, SymbolTable, add, SymbolKind, resolve, SymbolEntry } from './ast';

/**
 * Token types for the parser
 */
export enum TokenKind {
  // Literals
  IDENTIFIER = 'IDENTIFIER',
  
  // Operators - in precedence order (tightest first)
  NOT = 'NOT',           // ! ¬
  OR = 'OR',             // | ∨  
  AND = 'AND',           // & ∧
  IMPLIES = 'IMPLIES',   // -> →
  
  // Quantifiers
  FORALL = 'FORALL',     // forall ∀
  EXISTS = 'EXISTS',     // exists ∃
  
  // Punctuation
  LPAREN = 'LPAREN',     // (
  RPAREN = 'RPAREN',     // )
  COMMA = 'COMMA',       // ,
  DOT = 'DOT',           // .
  
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
  
  constructor(private input: string) {
    this.advance();
  }
  
  private advance(): void {
    this.current = this.pos < this.input.length ? this.input.charAt(this.pos++) : '';
  }
  
  private peek(): string {
    return this.pos < this.input.length ? this.input.charAt(this.pos) : '';
  }
  
  private skipWhitespace(): void {
    while (this.current && /\s/.test(this.current)) {
      this.advance();
    }
  }
  
  private readIdentifier(): string {
    let result = '';
    while (this.current && /[a-zA-Z0-9_]/.test(this.current)) {
      result += this.current;
      this.advance();
    }
    return result;
  }
  
  public nextToken(): Token {
    this.skipWhitespace();
    
    if (!this.current) {
      return { kind: TokenKind.EOF, value: '', pos: this.pos };
    }
    
    const startPos = this.pos - 1;
    
    switch (this.current) {
      case '(':
        this.advance();
        return { kind: TokenKind.LPAREN, value: '(', pos: startPos };
      case ')':
        this.advance();
        return { kind: TokenKind.RPAREN, value: ')', pos: startPos };
      case ',':
        this.advance();
        return { kind: TokenKind.COMMA, value: ',', pos: startPos };
      case '.':
        this.advance();
        return { kind: TokenKind.DOT, value: '.', pos: startPos };
      case '!':
      case '¬':
        this.advance();
        return { kind: TokenKind.NOT, value: this.input.charAt(startPos), pos: startPos };
      case '&':
      case '∧':
        this.advance();
        return { kind: TokenKind.AND, value: this.input.charAt(startPos), pos: startPos };
      case '|':
      case '∨':
        this.advance();
        return { kind: TokenKind.OR, value: this.input.charAt(startPos), pos: startPos };
      case '∀':
        this.advance();
        return { kind: TokenKind.FORALL, value: '∀', pos: startPos };
      case '∃':
        this.advance();
        return { kind: TokenKind.EXISTS, value: '∃', pos: startPos };
      case '→':
        this.advance();
        return { kind: TokenKind.IMPLIES, value: '→', pos: startPos };
    }
    
    if (this.current === '-' && this.peek() === '>') {
      this.advance(); // -
      this.advance(); // >
      return { kind: TokenKind.IMPLIES, value: '->', pos: startPos };
    }
    
    if (/[a-zA-Z\+\-\*]/.test(this.current)) {
      const value = this.readIdentifier();
      
      switch (value.toLowerCase()) {
        case 'forall':
          return { kind: TokenKind.FORALL, value, pos: startPos };
        case 'exists':
          return { kind: TokenKind.EXISTS, value, pos: startPos };
        default:
          return { kind: TokenKind.IDENTIFIER, value, pos: startPos };
      }
    }
    
    throw new Error(`Unexpected character '${this.current}' at position ${startPos}`);
  }
}

export class Parser {
  private current = 0;
  private tokens: Token[] = [];
  private bindings: Map<string, SymbolEntry> = new Map();
  
  constructor(
    private readonly lexer: Lexer,
    private readonly st: SymbolTable,
  ) {
    let token;
    do {
      token = this.lexer.nextToken();
      this.tokens.push(token);
    } while (token.kind !== TokenKind.EOF);
  }
  
  private peek(): Token {
    return this.tokens[this.current] || { kind: TokenKind.EOF, value: '', pos: -1 };
  }
  
  private advance(): Token {
    const token = this.peek();
    if (token.kind !== TokenKind.EOF) this.current++;
    return token;
  }
  
  private expect(kind: TokenKind): Token {
    const token = this.peek();
    if (token.kind !== kind) {
      throw new Error(`Expected ${kind} but got ${token.kind} at position ${token.pos}`);
    }
    return this.advance();
  }
  
  private match(...kinds: TokenKind[]): boolean {
    return kinds.includes(this.peek().kind);
  }

  private expectBinding(name: string, ...kinds: SymbolKind[]): SymbolEntry | undefined {
    const binding = this.bindings.get(name);
    if (!binding) {
      return undefined;
    }
    if (kinds.every(kind => binding.kind != kind)) {
      throw new Error(`Expected ${name} to be bound to be in ${
        kinds.join(' | ')} but got: ${binding.kind}`);
    }

    return binding;
  }

  ////////////////////////
  // Main entry points: //
  ////////////////////////
  
  public parseFormula(): Formula {
    const formula = this.parseImplication();
    if (this.peek().kind !== TokenKind.EOF) {
      throw new Error(`Unexpected token ${this.peek().kind} at position ${this.peek().pos}`);
    }
    return formula;
  }
  
  private parseImplication(): Formula {
    let left = this.parseDisjunction();
    
    while (this.match(TokenKind.IMPLIES)) {
      this.advance();
      const right = this.parseImplication();
      left = { kind: NodeKind.Implies, left, right };
    }
    
    return left;
  }

  private parseConjunction(): Formula {
    let left = this.parseNegation();
    
    while (this.match(TokenKind.AND)) {
      this.advance();
      const right = this.parseNegation();
      left = { kind: NodeKind.And, left, right };
    }
    
    return left;
  }
  
  private parseDisjunction(): Formula {
    let left = this.parseConjunction();
    
    while (this.match(TokenKind.OR)) {
      this.advance();
      const right = this.parseConjunction();
      left = { kind: NodeKind.Or, left, right };
    }
    
    return left;
  }
  
  private parseNegation(): Formula {
    if (this.match(TokenKind.NOT)) {
      this.advance();
      const arg = this.parseNegation();
      return { kind: NodeKind.Not, arg };
    }
    
    return this.parseQuantified();
  }
  
  private parseQuantified(): Formula {
    if (this.match(TokenKind.FORALL, TokenKind.EXISTS)) {
      const token = this.advance();
      const varList = this.parseVariableList();
      const vars = varList.map(name => {
        return add(this.st, SymbolKind.Var, Symbol(name));
      });

      this.expect(TokenKind.DOT);

      for (const v of vars) this.bindings.set(v.symbol.description!, v);
      const arg = this.parseQuantifiedBody();
      for (const v of vars) this.bindings.delete(v.symbol.description!);
      
      const idxs = vars.map(node => node.idx);
      if (token.kind === TokenKind.FORALL) {
        return { kind: NodeKind.ForAll, vars: idxs, arg };
      } else {
        return { kind: NodeKind.Exists, vars: idxs, arg };
      }
    }
    
    return this.parseAtom();
  }
  
  private parseQuantifiedBody(): Formula {
    if (this.match(TokenKind.LPAREN)) {
      return this.parseParenthesized();
    }
    
    if (this.match(TokenKind.FORALL, TokenKind.EXISTS)) {
      return this.parseQuantified();
    }
    
    return this.parseAtom();
  }
  
  private parseVariableList(): string[] {
    const vars: string[] = [];
    vars.push(this.expect(TokenKind.IDENTIFIER).value);
    
    while (this.match(TokenKind.COMMA)) {
      this.advance();
      vars.push(this.expect(TokenKind.IDENTIFIER).value);
    }
    
    return vars;
  }
  
  private parseAtom(): Formula {
    if (this.match(TokenKind.LPAREN)) {
      return this.parseParenthesized();
    }
    
    if (this.match(TokenKind.IDENTIFIER)) {
      const name = this.advance().value;
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
      }

      const rel = this.expectBinding(name, SymbolKind.Rel) ?? add(
        this.st,
        SymbolKind.Rel,
        Symbol(name),
        args.length,
      );

      this.bindings.set(name, rel);
      return { kind: NodeKind.Atom, idx: rel.idx, args };
    }
    
    throw new Error(`Expected atom or '(' at position ${this.peek().pos}`);
  }
  
  private parseParenthesized(): Formula {
    this.expect(TokenKind.LPAREN);
    const formula = this.parseImplication();
    this.expect(TokenKind.RPAREN);
    return formula;
  }
  
  private parseTerm(): Term {
    if (this.match(TokenKind.IDENTIFIER)) {
      const name = this.advance().value;
      
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

        const func = this.expectBinding(name, SymbolKind.Fun) ?? add(
          this.st,
          SymbolKind.Fun,
          Symbol(name),
          args.length,
        );
        
        this.bindings.set(name, func);
        return { kind: NodeKind.FunApp, idx: func.idx, args };
      } else {
        const entry = this.expectBinding(name, SymbolKind.Var, SymbolKind.Const);
        if (entry?.kind == SymbolKind.Var) {
          return { kind: NodeKind.Var, idx: entry.idx };
        } else if (entry?.kind == SymbolKind.Const) {
          return { kind: NodeKind.Const, idx: entry.idx };
        } else {
          // TODO: allow for unbound variables as well
          const c = add(this.st, SymbolKind.Const, Symbol(name));
          this.bindings.set(name, c);
          return { kind: NodeKind.Const, idx: c.idx };
        }
      }
    }
    
    throw new Error(`Expected term at position ${this.peek().pos}`);
  }
}

/**
 * Parse a formula string into a Formula AST
 */
export function parseFormula(input: string, st: SymbolTable): Formula {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer, st);
  return parser.parseFormula();
}

/**
 * Operator precedence for rendering (higher number = tighter binding)
 */
const PRECEDENCE = {
  [NodeKind.Implies]: 1,
  [NodeKind.Or]: 2,
  [NodeKind.And]: 3,
  [NodeKind.Not]: 4,
} as const;

/**
 * Check if we need brackets around a subformula when rendering
 */
function needsBrackets(child: Formula, parent: Formula): boolean {
  const childPrec = PRECEDENCE[child.kind as keyof typeof PRECEDENCE];
  const parentPrec = PRECEDENCE[parent.kind as keyof typeof PRECEDENCE];
  
  if (childPrec === undefined || parentPrec === undefined) {
    return false; // Quantifiers and atoms don't need precedence checking
  }
  
  // Lower precedence needs brackets
  if (childPrec < parentPrec) {
    return true;
  }
  
  // Same precedence: check associativity
  if (childPrec === parentPrec) {
    // Right-associative operators (just implication)
    if (parent.kind === NodeKind.Implies && child === (parent as any).left) {
      return true;
    }
    // Left-associative operators need brackets on right
    if ((parent.kind === NodeKind.And || parent.kind === NodeKind.Or) && 
        child === (parent as any).right && child.kind === parent.kind) {
      return false; // Same operator, left-associative, no brackets needed
    }
  }
  
  return false;
}

/**
 * Render a term to string
 */
function renderTerm(term: Term, st: SymbolTable): string {
  switch (term.kind) {
    case NodeKind.Var:
      const varEntry = resolve(SymbolKind.Var, term.idx, st);
      return varEntry.symbol.description ?? `var_${term.idx}`;
    case NodeKind.Const:
      const constEntry = resolve(SymbolKind.Const, term.idx, st);
      return constEntry.symbol.description ?? `const_${term.idx}`;
    case NodeKind.FunApp:
      const funEntry = resolve(SymbolKind.Fun, term.idx, st);
      const funName = funEntry.symbol.description ?? `f_${term.idx}`;
      if (term.args.length === 0) {
        return funName;
      }
      const funArgs = term.args.map(arg => renderTerm(arg, st)).join(', ');
      return `${funName}(${funArgs})`;
    default:
      const _exhaustive: never = term;
      throw new Error(`Unknown term kind: ${_exhaustive}`);
  }
}

/**
 * Render a formula to string with minimal brackets
 */
export function renderFormula(formula: Formula, st: SymbolTable): string {
  function render(f: Formula, parent?: Formula): string {
    const needsParens = parent && needsBrackets(f, parent);
    
    let result: string;
    
    switch (f.kind) {
      case NodeKind.Atom:
        const relEntry = resolve(SymbolKind.Rel, f.idx, st);
        const relName = relEntry.symbol.description ?? `R_${f.idx}`;
        if (f.args.length === 0) {
          result = relName;
        } else {
          const args = f.args.map(arg => renderTerm(arg, st)).join(', ');
          result = `${relName}(${args})`;
        }
        break;
      case NodeKind.Not:
        result = `¬${render(f.arg, f)}`;
        break;
      case NodeKind.And:
        result = `${render(f.left, f)} ∧ ${render(f.right, f)}`;
        break;
      case NodeKind.Or:
        result = `${render(f.left, f)} ∨ ${render(f.right, f)}`;
        break;
      case NodeKind.Implies:
        result = `${render(f.left, f)} → ${render(f.right, f)}`;
        break;
      case NodeKind.ForAll:
        const forallVars = f.vars.map(idx => {
          const varEntry = resolve(SymbolKind.Var, idx, st);
          return varEntry.symbol.description ?? `var_${idx}`;
        }).join(', ');
        const forallBody = isAtomicFormula(f.arg) ? render(f.arg) : `(${render(f.arg)})`;
        result = `∀${forallVars}.${forallBody}`;
        break;
      case NodeKind.Exists:
        const existsVars = f.vars.map(idx => {
          const varEntry = resolve(SymbolKind.Var, idx, st);
          return varEntry.symbol.description ?? `var_${idx}`;
        }).join(', ');
        const existsBody = isAtomicFormula(f.arg) ? render(f.arg) : `(${render(f.arg)})`;
        result = `∃${existsVars}.${existsBody}`;
        break;
      default:
        const _exhaustive: never = f;
        throw new Error(`Unknown formula kind: ${_exhaustive}`);
    }
    
    return needsParens ? `(${result})` : result;
  }
  
  return render(formula);
}

/**
 * Check if a formula is atomic (doesn't need brackets in quantifier bodies)
 */
function isAtomicFormula(f: Formula): boolean {
  return f.kind === NodeKind.Atom || 
         (f.kind === NodeKind.Not && f.arg.kind === NodeKind.Atom);
}
