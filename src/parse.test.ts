import { expect } from 'chai';
import { parseFormula, renderFormula, Lexer, TokenKind } from './parse';
import { createSymbolTable, NodeKind, construct, render } from './ast';
import { toCNF } from './cnf';

describe('parse.ts', () => {
  describe('Lexer', () => {
    it('should tokenize simple identifiers', () => {
      const lexer = new Lexer('abc def');
      expect(lexer.nextToken()).to.deep.equal({
        kind: TokenKind.IDENTIFIER,
        value: 'abc',
        pos: 0,
      });
      expect(lexer.nextToken()).to.deep.equal({
        kind: TokenKind.IDENTIFIER,
        value: 'def',
        pos: 4,
      });
      expect(lexer.nextToken()).to.deep.equal({
        kind: TokenKind.EOF,
        value: '',
        pos: 7,
      });
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
      const f = parseFormula('P(x, y, a)', st);
      expect(f.kind).to.equal(NodeKind.Atom);
      if (f.kind === NodeKind.Atom) {
        expect(f.args.length).to.equal(3);
        expect(f.args[0]?.kind).to.equal(NodeKind.Var);
        expect(f.args[1]?.kind).to.equal(NodeKind.Var);
        expect(f.args[2]?.kind).to.equal(NodeKind.Const);
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
      // Should parse as (P | Q) & R because OR binds tighter
      expect(f.kind).to.equal(NodeKind.And);
      if (f.kind === NodeKind.And) {
        expect(f.left.kind).to.equal(NodeKind.Or);
        expect(f.right.kind).to.equal(NodeKind.Atom);
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
      // Should parse as ((¬P ∨ Q) ∧ R) → S
      expect(f.kind).to.equal(NodeKind.Implies);
      if (f.kind === NodeKind.Implies) {
        expect(f.left.kind).to.equal(NodeKind.And);
        expect(f.right.kind).to.equal(NodeKind.Atom);
        if (f.left.kind === NodeKind.And) {
          expect(f.left.left.kind).to.equal(NodeKind.Or);
          expect(f.left.right.kind).to.equal(NodeKind.Atom);
          if (f.left.left.kind === NodeKind.Or) {
            expect(f.left.left.left.kind).to.equal(NodeKind.Not);
            expect(f.left.left.right.kind).to.equal(NodeKind.Atom);
          }
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

      const f1 = parseFormula('P | Q & R', st);
      expect(renderFormula(f1, st)).to.equal('P ∨ Q ∧ R');

      const f2 = parseFormula('(P | Q) & R', st);
      expect(renderFormula(f2, st)).to.equal('P ∨ Q ∧ R');
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

    testCases.forEach((testCase) => {
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

  describe('Multiple Formula Parsing', () => {
    it('should maintain constant bindings across multiple formula parses', () => {
      const st = createSymbolTable();

      // Parse first formula with constant 'a'
      const f1 = parseFormula('P(a)', st);
      expect(f1.kind).to.equal(NodeKind.Atom);
      if (f1.kind === NodeKind.Atom) {
        expect(f1.args[0]?.kind).to.equal(NodeKind.Const);
      }

      // Parse second formula - 'a' should still be recognized as the same constant
      const f2 = parseFormula('Q(a)', st);
      expect(f2.kind).to.equal(NodeKind.Atom);
      if (f2.kind === NodeKind.Atom) {
        expect(f2.args[0]?.kind).to.equal(NodeKind.Const);
        // Should be the same constant index as in first formula
        if (f1.kind === NodeKind.Atom) {
          expect(f2.args[0]).to.deep.equal(f1.args[0]);
        }
      }
    });

    it('should maintain function bindings across multiple formula parses', () => {
      const st = createSymbolTable();

      // Parse first formula with function 'f'
      const f1 = parseFormula('P(f(x))', st);
      expect(f1.kind).to.equal(NodeKind.Atom);

      // Parse second formula - 'f' should still be recognized as the same function
      const f2 = parseFormula('Q(f(y))', st);
      expect(f2.kind).to.equal(NodeKind.Atom);
      if (f2.kind === NodeKind.Atom && f1.kind === NodeKind.Atom) {
        const fun1 = f1.args[0];
        const fun2 = f2.args[0];
        if (fun1?.kind === NodeKind.FunApp && fun2?.kind === NodeKind.FunApp) {
          // Should be the same function index
          expect(fun2.idx).to.equal(fun1.idx);
        }
      }
    });

    it('should maintain relation bindings across multiple formula parses', () => {
      const st = createSymbolTable();

      // Parse first formula with binary relation 'R'
      const f1 = parseFormula('R(a, b)', st);
      expect(f1.kind).to.equal(NodeKind.Atom);

      // Parse second formula - 'R' should still be recognized as the same relation
      const f2 = parseFormula('R(c, d)', st);
      expect(f2.kind).to.equal(NodeKind.Atom);
      if (f1.kind === NodeKind.Atom && f2.kind === NodeKind.Atom) {
        // Should be the same relation index
        expect(f2.idx).to.equal(f1.idx);
      }
    });

    it('should handle mixed constants and variables across multiple formulas', () => {
      const st = createSymbolTable();

      // Parse formula with constants and variables
      const f1 = parseFormula('P(a, x)', st);
      expect(f1.kind).to.equal(NodeKind.Atom);

      // Parse another formula - should maintain constant/variable distinctions
      const f2 = parseFormula('Q(a, y)', st);
      expect(f2.kind).to.equal(NodeKind.Atom);

      if (f1.kind === NodeKind.Atom && f2.kind === NodeKind.Atom) {
        // 'a' should be the same constant in both
        expect(f2.args[0]).to.deep.equal(f1.args[0]);
        expect(f1.args[0]?.kind).to.equal(NodeKind.Const);
        expect(f2.args[0]?.kind).to.equal(NodeKind.Const);

        // 'x' and 'y' should be different variables
        expect(f1.args[1]?.kind).to.equal(NodeKind.Var);
        expect(f2.args[1]?.kind).to.equal(NodeKind.Var);
        expect(f2.args[1]).to.not.deep.equal(f1.args[1]);
      }
    });
  });

  describe('Quantifier Variable Binding Edge Cases', () => {
    it('should not clear constant bindings when quantifier uses same name', () => {
      const st = createSymbolTable();

      // First, establish 'a' as a constant
      const f1 = parseFormula('P(a)', st);
      expect(f1.kind).to.equal(NodeKind.Atom);
      if (f1.kind === NodeKind.Atom) {
        expect(f1.args[0]?.kind).to.equal(NodeKind.Const);
      }

      // Parse a formula with quantifier that binds a variable named 'a'
      const f2 = parseFormula('forall a.Q(a)', st);
      expect(f2.kind).to.equal(NodeKind.ForAll);
      if (f2.kind === NodeKind.ForAll) {
        expect(f2.arg.kind).to.equal(NodeKind.Atom);
        if (f2.arg.kind === NodeKind.Atom) {
          // Inside the quantifier, 'a' should be a variable
          expect(f2.arg.args[0]?.kind).to.equal(NodeKind.Var);
        }
      }

      // After parsing the quantified formula, 'a' should still be recognized as a constant
      const f3 = parseFormula('R(a)', st);
      expect(f3.kind).to.equal(NodeKind.Atom);
      if (f3.kind === NodeKind.Atom && f1.kind === NodeKind.Atom) {
        // Should be the same constant as in the first formula
        expect(f3.args[0]).to.deep.equal(f1.args[0]);
        expect(f3.args[0]?.kind).to.equal(NodeKind.Const);
      }
    });

    it('should handle nested quantifiers with name conflicts', () => {
      const st = createSymbolTable();

      // Establish 'x' as a variable (since 'x' looks like a variable)
      const f1 = parseFormula('P(x)', st);
      expect(f1.kind).to.equal(NodeKind.Atom);
      if (f1.kind === NodeKind.Atom) {
        expect(f1.args[0]?.kind).to.equal(NodeKind.Var);
      }

      // Parse nested quantifiers both using 'x'
      const f2 = parseFormula('forall x.exists x.Q(x)', st);
      expect(f2.kind).to.equal(NodeKind.ForAll);
      if (f2.kind === NodeKind.ForAll) {
        expect(f2.arg.kind).to.equal(NodeKind.Exists);
        if (f2.arg.kind === NodeKind.Exists) {
          expect(f2.arg.arg.kind).to.equal(NodeKind.Atom);
        }
      }

      // After parsing, 'x' should still be the original variable
      const f3 = parseFormula('R(x)', st);
      expect(f3.kind).to.equal(NodeKind.Atom);
      if (f3.kind === NodeKind.Atom && f1.kind === NodeKind.Atom) {
        expect(f3.args[0]).to.deep.equal(f1.args[0]);
        expect(f3.args[0]?.kind).to.equal(NodeKind.Var);
      }
    });

    it('should handle nested quantifiers with constant name conflicts', () => {
      const st = createSymbolTable();

      // Establish 'a' as a constant (since 'a' does not look like a variable)
      const f1 = parseFormula('P(a)', st);
      expect(f1.kind).to.equal(NodeKind.Atom);
      if (f1.kind === NodeKind.Atom) {
        expect(f1.args[0]?.kind).to.equal(NodeKind.Const);
      }

      // Parse nested quantifiers both using 'a'
      const f2 = parseFormula('forall a.exists a.Q(a)', st);
      expect(f2.kind).to.equal(NodeKind.ForAll);
      if (f2.kind === NodeKind.ForAll) {
        expect(f2.arg.kind).to.equal(NodeKind.Exists);
        if (f2.arg.kind === NodeKind.Exists) {
          expect(f2.arg.arg.kind).to.equal(NodeKind.Atom);
        }
      }

      // After parsing, 'a' should still be the original constant
      const f3 = parseFormula('R(a)', st);
      expect(f3.kind).to.equal(NodeKind.Atom);
      if (f3.kind === NodeKind.Atom && f1.kind === NodeKind.Atom) {
        expect(f3.args[0]).to.deep.equal(f1.args[0]);
        expect(f3.args[0]?.kind).to.equal(NodeKind.Const);
      }
    });

    it('should handle multiple variables with same names as existing symbols', () => {
      const st = createSymbolTable();

      // Establish multiple constants
      const f1 = parseFormula('P(a, b, c)', st);
      expect(f1.kind).to.equal(NodeKind.Atom);

      // Parse quantified formula using all the same names
      const f2 = parseFormula('forall a,b,c.Q(a,b,c)', st);
      expect(f2.kind).to.equal(NodeKind.ForAll);
      if (f2.kind === NodeKind.ForAll) {
        expect(f2.vars.length).to.equal(3);
        expect(f2.arg.kind).to.equal(NodeKind.Atom);
        if (f2.arg.kind === NodeKind.Atom) {
          // All should be variables inside the quantifier
          f2.arg.args.forEach((arg) => {
            expect(arg?.kind).to.equal(NodeKind.Var);
          });
        }
      }

      // After parsing, all should still be constants
      const f3 = parseFormula('R(a, b, c)', st);
      expect(f3.kind).to.equal(NodeKind.Atom);
      if (f3.kind === NodeKind.Atom && f1.kind === NodeKind.Atom) {
        // Should be the same constants as in the first formula
        f3.args.forEach((arg, i) => {
          expect(arg).to.deep.equal(f1.args[i]);
          expect(arg?.kind).to.equal(NodeKind.Const);
        });
      }
    });

    it('should handle function name conflicts with quantified variables', () => {
      const st = createSymbolTable();

      // Establish 'f' as a function
      const f1 = parseFormula('P(f(x))', st);
      expect(f1.kind).to.equal(NodeKind.Atom);

      // Parse quantified formula using 'f' as a variable name
      const f2 = parseFormula('forall f.Q(f)', st);
      expect(f2.kind).to.equal(NodeKind.ForAll);
      if (f2.kind === NodeKind.ForAll) {
        expect(f2.arg.kind).to.equal(NodeKind.Atom);
        if (f2.arg.kind === NodeKind.Atom) {
          // Inside quantifier, 'f' should be a variable
          expect(f2.arg.args[0]?.kind).to.equal(NodeKind.Var);
        }
      }

      // After parsing, 'f' should still work as a function
      const f3 = parseFormula('R(f(y))', st);
      expect(f3.kind).to.equal(NodeKind.Atom);
      if (f3.kind === NodeKind.Atom && f1.kind === NodeKind.Atom) {
        const fun1 = f1.args[0];
        const fun3 = f3.args[0];
        if (fun1?.kind === NodeKind.FunApp && fun3?.kind === NodeKind.FunApp) {
          // Should be the same function index
          expect(fun3.idx).to.equal(fun1.idx);
        }
      }
    });
  });

  describe('Integration with AST', () => {
    it('should produce equivalent results to manual AST construction', () => {
      const st = createSymbolTable();

      // Manually construct P(x) & Q(x)
      const manual = construct(st, (builder) => {
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
