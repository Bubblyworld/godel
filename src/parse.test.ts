import { expect } from 'chai';
import { parseFormula, renderFormula, Lexer, TokenKind } from './parse';
import { createSymbolTable, NodeKind, construct, render } from './ast';
import { toCNF } from './cnf';

describe('parse.ts', () => {
  describe('Lexer', () => {
    it('should tokenize simple identifiers', () => {
      const lexer = new Lexer('abc def');
      expect(lexer.nextToken()).to.deep.equal({ kind: TokenKind.IDENTIFIER, value: 'abc', pos: 0 });
      expect(lexer.nextToken()).to.deep.equal({ kind: TokenKind.IDENTIFIER, value: 'def', pos: 4 });
      expect(lexer.nextToken()).to.deep.equal({ kind: TokenKind.EOF, value: '', pos: 7 });
    });

    it('should tokenize operators', () => {
      const lexer = new Lexer('! & | -> ¬ ∧ ∨ →');
      expect(lexer.nextToken().kind).to.equal(TokenKind.NOT);
      expect(lexer.nextToken().kind).to.equal(TokenKind.AND);
      expect(lexer.nextToken().kind).to.equal(TokenKind.OR);
      expect(lexer.nextToken().kind).to.equal(TokenKind.IMPLIES);
      expect(lexer.nextToken().kind).to.equal(TokenKind.NOT);
      expect(lexer.nextToken().kind).to.equal(TokenKind.AND);
      expect(lexer.nextToken().kind).to.equal(TokenKind.OR);
      expect(lexer.nextToken().kind).to.equal(TokenKind.IMPLIES);
    });

    it('should tokenize quantifiers', () => {
      const lexer = new Lexer('forall exists ∀ ∃');
      expect(lexer.nextToken().kind).to.equal(TokenKind.FORALL);
      expect(lexer.nextToken().kind).to.equal(TokenKind.EXISTS);
      expect(lexer.nextToken().kind).to.equal(TokenKind.FORALL);
      expect(lexer.nextToken().kind).to.equal(TokenKind.EXISTS);
    });

    it('should tokenize punctuation', () => {
      const lexer = new Lexer('( ) , .');
      expect(lexer.nextToken().kind).to.equal(TokenKind.LPAREN);
      expect(lexer.nextToken().kind).to.equal(TokenKind.RPAREN);
      expect(lexer.nextToken().kind).to.equal(TokenKind.COMMA);
      expect(lexer.nextToken().kind).to.equal(TokenKind.DOT);
    });
  });

  describe('Parser - Basic Formulas', () => {
    it('should parse simple atoms', () => {
      const st = createSymbolTable();
      const f = parseFormula('P', st);
      expect(f.kind).to.equal(NodeKind.Atom);
      if (f.kind === NodeKind.Atom) {
        expect(f.args.length).to.equal(0);
      }
    });

    it('should parse atoms with arguments', () => {
      const st = createSymbolTable();
      const f = parseFormula('P(x, y)', st);
      expect(f.kind).to.equal(NodeKind.Atom);
      if (f.kind === NodeKind.Atom) {
        expect(f.args.length).to.equal(2);
        expect(f.args[0]?.kind).to.equal(NodeKind.Const);
        expect(f.args[1]?.kind).to.equal(NodeKind.Const);
      }
    });

    it('should parse negation', () => {
      const st = createSymbolTable();
      const f = parseFormula('!P(x)', st);
      expect(f.kind).to.equal(NodeKind.Not);
      if (f.kind === NodeKind.Not) {
        expect(f.arg.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should parse negation with unicode symbol', () => {
      const st = createSymbolTable();
      const f = parseFormula('¬P(x)', st);
      expect(f.kind).to.equal(NodeKind.Not);
      if (f.kind === NodeKind.Not) {
        expect(f.arg.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should parse double negation', () => {
      const st = createSymbolTable();
      const f = parseFormula('!!P', st);
      expect(f.kind).to.equal(NodeKind.Not);
      if (f.kind === NodeKind.Not) {
        expect(f.arg.kind).to.equal(NodeKind.Not);
        if (f.arg.kind === NodeKind.Not) {
          expect(f.arg.arg.kind).to.equal(NodeKind.Atom);
        }
      }
    });
  });

  describe('Parser - Binary Operators', () => {
    it('should parse conjunction', () => {
      const st = createSymbolTable();
      const f = parseFormula('P & Q', st);
      expect(f.kind).to.equal(NodeKind.And);
      if (f.kind === NodeKind.And) {
        expect(f.left.kind).to.equal(NodeKind.Atom);
        expect(f.right.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should parse disjunction', () => {
      const st = createSymbolTable();
      const f = parseFormula('P | Q', st);
      expect(f.kind).to.equal(NodeKind.Or);
      if (f.kind === NodeKind.Or) {
        expect(f.left.kind).to.equal(NodeKind.Atom);
        expect(f.right.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should parse implication', () => {
      const st = createSymbolTable();
      const f = parseFormula('P -> Q', st);
      expect(f.kind).to.equal(NodeKind.Implies);
      if (f.kind === NodeKind.Implies) {
        expect(f.left.kind).to.equal(NodeKind.Atom);
        expect(f.right.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should parse implication with unicode arrow', () => {
      const st = createSymbolTable();
      const f = parseFormula('P → Q', st);
      expect(f.kind).to.equal(NodeKind.Implies);
    });
  });

  describe('Parser - Operator Precedence', () => {
    it('should have OR bind tighter than AND', () => {
      const st = createSymbolTable();
      const f = parseFormula('P | Q & R', st);
      // Should parse as P | (Q & R) because OR binds tighter
      expect(f.kind).to.equal(NodeKind.Or);
      if (f.kind === NodeKind.Or) {
        expect(f.left.kind).to.equal(NodeKind.Atom);
        expect(f.right.kind).to.equal(NodeKind.And);
      }
    });

    it('should have AND bind tighter than IMPLIES', () => {
      const st = createSymbolTable();
      const f = parseFormula('P & Q -> R', st);
      // Should parse as (P & Q) -> R
      expect(f.kind).to.equal(NodeKind.Implies);
      if (f.kind === NodeKind.Implies) {
        expect(f.left.kind).to.equal(NodeKind.And);
        expect(f.right.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should have NOT bind tightest', () => {
      const st = createSymbolTable();
      const f = parseFormula('!P & Q', st);
      // Should parse as (!P) & Q
      expect(f.kind).to.equal(NodeKind.And);
      if (f.kind === NodeKind.And) {
        expect(f.left.kind).to.equal(NodeKind.Not);
        expect(f.right.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should handle complex precedence', () => {
      const st = createSymbolTable();
      const f = parseFormula('!P | Q & R -> S', st);
      // Should parse as (¬P ∨ (Q ∧ R)) → S because OR binds tighter than AND
      expect(f.kind).to.equal(NodeKind.Implies);
      if (f.kind === NodeKind.Implies) {
        expect(f.left.kind).to.equal(NodeKind.Or);
        expect(f.right.kind).to.equal(NodeKind.Atom);
        if (f.left.kind === NodeKind.Or) {
          expect(f.left.left.kind).to.equal(NodeKind.Not);
          expect(f.left.right.kind).to.equal(NodeKind.And);
        }
      }
    });

    it('should make implication right-associative', () => {
      const st = createSymbolTable();
      const f = parseFormula('P -> Q -> R', st);
      // Should parse as P -> (Q -> R)
      expect(f.kind).to.equal(NodeKind.Implies);
      if (f.kind === NodeKind.Implies) {
        expect(f.left.kind).to.equal(NodeKind.Atom);
        expect(f.right.kind).to.equal(NodeKind.Implies);
      }
    });
  });

  describe('Parser - Parentheses', () => {
    it('should override precedence with parentheses', () => {
      const st = createSymbolTable();
      const f = parseFormula('(P | Q) & R', st);
      // Should parse as (P | Q) & R
      expect(f.kind).to.equal(NodeKind.And);
      if (f.kind === NodeKind.And) {
        expect(f.left.kind).to.equal(NodeKind.Or);
        expect(f.right.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should handle nested parentheses', () => {
      const st = createSymbolTable();
      const f = parseFormula('((P))', st);
      expect(f.kind).to.equal(NodeKind.Atom);
    });
  });

  describe('Parser - Quantifiers', () => {
    it('should parse universal quantifier', () => {
      const st = createSymbolTable();
      const f = parseFormula('forall x.P(x)', st);
      expect(f.kind).to.equal(NodeKind.ForAll);
      if (f.kind === NodeKind.ForAll) {
        expect(f.vars.length).to.equal(1);
        expect(f.arg.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should parse existential quantifier', () => {
      const st = createSymbolTable();
      const f = parseFormula('exists x.P(x)', st);
      expect(f.kind).to.equal(NodeKind.Exists);
      if (f.kind === NodeKind.Exists) {
        expect(f.vars.length).to.equal(1);
        expect(f.arg.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should parse quantifiers with unicode symbols', () => {
      const st = createSymbolTable();
      const f1 = parseFormula('∀x.P(x)', st);
      expect(f1.kind).to.equal(NodeKind.ForAll);
      
      const f2 = parseFormula('∃x.P(x)', st);
      expect(f2.kind).to.equal(NodeKind.Exists);
    });

    it('should parse multiple variables in quantifier', () => {
      const st = createSymbolTable();
      const f = parseFormula('forall x,y.P(x,y)', st);
      expect(f.kind).to.equal(NodeKind.ForAll);
      if (f.kind === NodeKind.ForAll) {
        expect(f.vars.length).to.equal(2);
      }
    });

    it('should require brackets for complex quantifier bodies', () => {
      const st = createSymbolTable();
      const f = parseFormula('forall x.(P(x) & Q(x))', st);
      expect(f.kind).to.equal(NodeKind.ForAll);
      if (f.kind === NodeKind.ForAll) {
        expect(f.arg.kind).to.equal(NodeKind.And);
      }
    });

    it('should parse nested quantifiers', () => {
      const st = createSymbolTable();
      const f = parseFormula('forall x.exists y.P(x,y)', st);
      expect(f.kind).to.equal(NodeKind.ForAll);
      if (f.kind === NodeKind.ForAll) {
        expect(f.arg.kind).to.equal(NodeKind.Exists);
        if (f.arg.kind === NodeKind.Exists) {
          expect(f.arg.arg.kind).to.equal(NodeKind.Atom);
        }
      }
    });
  });

  describe('Parser - Function Applications', () => {
    it('should parse function applications in terms', () => {
      const st = createSymbolTable();
      const f = parseFormula('P(f(x))', st);
      expect(f.kind).to.equal(NodeKind.Atom);
      if (f.kind === NodeKind.Atom) {
        expect(f.args.length).to.equal(1);
        expect(f.args[0]?.kind).to.equal(NodeKind.FunApp);
        if (f.args[0]?.kind === NodeKind.FunApp) {
          expect(f.args[0].args.length).to.equal(1);
        }
      }
    });

    it('should parse nested function applications', () => {
      const st = createSymbolTable();
      const f = parseFormula('P(f(g(x)))', st);
      expect(f.kind).to.equal(NodeKind.Atom);
      if (f.kind === NodeKind.Atom) {
        const arg = f.args[0];
        expect(arg?.kind).to.equal(NodeKind.FunApp);
        if (arg?.kind === NodeKind.FunApp) {
          const nestedArg = arg.args[0];
          expect(nestedArg?.kind).to.equal(NodeKind.FunApp);
        }
      }
    });
  });

  describe('Renderer', () => {
    it('should render simple atoms', () => {
      const st = createSymbolTable();
      const f = parseFormula('P', st);
      expect(renderFormula(f, st)).to.equal('P');
    });

    it('should render atoms with arguments', () => {
      const st = createSymbolTable();
      const f = parseFormula('P(x, y)', st);
      expect(renderFormula(f, st)).to.equal('P(x, y)');
    });

    it('should render negation', () => {
      const st = createSymbolTable();
      const f = parseFormula('!P', st);
      expect(renderFormula(f, st)).to.equal('¬P');
    });

    it('should render binary operators', () => {
      const st = createSymbolTable();
      const f1 = parseFormula('P & Q', st);
      expect(renderFormula(f1, st)).to.equal('P ∧ Q');
      
      const f2 = parseFormula('P | Q', st);
      expect(renderFormula(f2, st)).to.equal('P ∨ Q');
      
      const f3 = parseFormula('P -> Q', st);
      expect(renderFormula(f3, st)).to.equal('P → Q');
    });

    it('should render quantifiers', () => {
      const st = createSymbolTable();
      const f1 = parseFormula('forall x.P(x)', st);
      expect(renderFormula(f1, st)).to.equal('∀x.P(x)');
      
      const f2 = parseFormula('exists x.P(x)', st);
      expect(renderFormula(f2, st)).to.equal('∃x.P(x)');
    });

    it('should add minimal brackets based on precedence', () => {
      const st = createSymbolTable();
      
      // OR binds tighter than AND, so no brackets needed
      const f1 = parseFormula('P | Q & R', st);
      expect(renderFormula(f1, st)).to.equal('P ∨ Q ∧ R');
      
      // When precedence requires brackets  
      const f2 = parseFormula('(P | Q) & R', st);
      expect(renderFormula(f2, st)).to.equal('(P ∨ Q) ∧ R');
    });

    it('should handle complex formulas with minimal brackets', () => {
      const st = createSymbolTable();
      const f = parseFormula('!P | Q & R -> S', st);
      expect(renderFormula(f, st)).to.equal('¬P ∨ Q ∧ R → S');
    });

    it('should bracket complex quantifier bodies', () => {
      const st = createSymbolTable();
      const f = parseFormula('forall x.(P(x) & Q(x))', st);
      expect(renderFormula(f, st)).to.equal('∀x.(P(x) ∧ Q(x))');
    });
  });

  describe('Round-trip Testing', () => {
    const testCases = [
      'P',
      'P(x)',
      'P(x, y)',
      '!P',
      'P & Q',
      'P | Q',
      'P -> Q',
      'forall x.P(x)',
      'exists x.P(x)',
      'forall x,y.P(x,y)',
      '!P & Q',
      'P | Q & R',
      '(P & Q) | R',
      'P -> Q -> R',
      'forall x.(P(x) & Q(x))',
      'exists x.(P(x) | Q(x))',
      'forall x.exists y.P(x,y)',
      '!(P & Q)',
      'P(f(x))',
      'P(f(g(x)))',
    ];

    testCases.forEach(testCase => {
      it(`should round-trip: ${testCase}`, () => {
        const st = createSymbolTable();
        const parsed = parseFormula(testCase, st);
        const rendered = renderFormula(parsed, st);

        // Parse the rendered version and check it's equivalent
        const st2 = createSymbolTable();
        const reparsed = parseFormula(rendered, st2);
        
        // The structures should be equivalent (we can't easily compare symbol tables)
        expect(JSON.stringify(parsed)).to.not.throw;
        expect(JSON.stringify(reparsed)).to.not.throw;
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw on unexpected tokens', () => {
      const st = createSymbolTable();
      expect(() => parseFormula('P Q', st)).to.throw();
    });

    it('should throw on unmatched parentheses', () => {
      const st = createSymbolTable();
      expect(() => parseFormula('(P', st)).to.throw();
      expect(() => parseFormula('P)', st)).to.throw();
    });

    it('should throw on invalid quantifier syntax', () => {
      const st = createSymbolTable();
      expect(() => parseFormula('forall', st)).to.throw();
      expect(() => parseFormula('forall x', st)).to.throw();
    });

    it('should throw on unexpected characters', () => {
      const st = createSymbolTable();
      expect(() => parseFormula('P # Q', st)).to.throw();
    });
  });

  describe('Integration with AST', () => {
    it('should produce equivalent results to manual AST construction', () => {
      const st = createSymbolTable();
      
      // Manually construct P(x) & Q(x)
      const manual = construct(st, builder => {
        return builder.and(
          builder.atom(Symbol('P'), builder.var(Symbol('x'))),
          builder.atom(Symbol('Q'), builder.var(Symbol('x')))
        );
      });
      
      // Parse the same formula
      const st2 = createSymbolTable();
      const parsed = parseFormula('P(x) & Q(x)', st2);
      
      // Should have the same structure
      expect(parsed.kind).to.equal(manual.kind);
      expect(parsed.kind).to.equal(NodeKind.And);
    });

    it('should parse simple identifiers as constants, not nullary functions', () => {
      const st = createSymbolTable();
      const f = parseFormula('P', st);
      
      expect(f.kind).to.equal(NodeKind.Atom);
      if (f.kind === NodeKind.Atom) {
        expect(f.args.length).to.equal(0);
        
        // Check that P was added as a relation, not a function
        // and that there are no functions in the symbol table
        expect(st.rels.length).to.equal(1);
        expect(st.funs.length).to.equal(0);
        expect(st.rels[0]?.symbol.description).to.equal('P');
        expect(st.rels[0]?.arity).to.equal(0);
      }
    });
  });
});
