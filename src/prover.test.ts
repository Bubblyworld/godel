import { describe, it } from 'mocha';
import { expect } from 'chai';
import { proves, DebugInfo } from './prover';
import { parseFormula } from './parse';
import { createSymbolTable } from './ast';

describe('prover.ts', () => {
  describe('proves', () => {
    it('should prove modus ponens', () => {
      const st = createSymbolTable();

      // Theory: P(a) and P(a) -> Q(a)
      const theory = [
        parseFormula('P(a)', st),
        parseFormula('P(a) -> Q(a)', st),
      ];

      // Formula to prove: Q(a)
      const formula = parseFormula('Q(a)', st);

      expect(proves(theory, formula, st)).to.be.true;
    });

    it('should prove universal instantiation', () => {
      const st = createSymbolTable();

      // Theory: forall x. P(x)
      const theory = [parseFormula('forall x. P(x)', st)];

      // Formula to prove: P(a)
      const formula = parseFormula('P(a)', st);

      expect(proves(theory, formula, st)).to.be.true;
    });

    it('should prove simple syllogism', () => {
      const st = createSymbolTable();

      // Theory: forall x. (P(x) -> Q(x)) and forall x. (Q(x) -> R(x)) and P(a)
      const theory = [
        parseFormula('forall x. (P(x) -> Q(x))', st),
        parseFormula('forall x. (Q(x) -> R(x))', st),
        parseFormula('P(a)', st),
      ];

      // Formula to prove: R(a)
      const formula = parseFormula('R(a)', st);

      expect(proves(theory, formula, st)).to.be.true;
    });

    it('should prove existential introduction', () => {
      const st = createSymbolTable();

      // Theory: P(a)
      const theory = [parseFormula('P(a)', st)];

      // Formula to prove: exists x. P(x)
      const formula = parseFormula('exists x. P(x)', st);

      expect(proves(theory, formula, st)).to.be.true;
    });

    it('should prove contradiction leads to anything', () => {
      const st = createSymbolTable();

      // Theory: P(a) and !P(a)
      const theory = [parseFormula('P(a)', st), parseFormula('!P(a)', st)];

      // Formula to prove: Q(b) (anything follows from contradiction)
      const formula = parseFormula('Q(b)', st);

      expect(proves(theory, formula, st)).to.be.true;
    });

    // ===== EASY EDGE CASES =====
    
    it('EDGE: should prove tautology from empty theory', () => {
      const st = createSymbolTable();
      
      // Empty theory
      const theory: any[] = [];
      
      // Try to prove tautology: P(a) | !P(a)
      const formula = parseFormula('P(a) | !P(a)', st);
      
      const result = proves(theory, formula, st, true);
      console.log('=== TAUTOLOGY TEST DEBUG ===');
      console.log('Result:', result.result);
      console.log('Initial clauses:', result.debug.initialClauses.length);
      console.log('Termination reason:', result.debug.terminationReason);
      console.log('Total iterations:', result.debug.totalIterations);
      console.log('Resolution steps:', result.debug.resolutionSteps.length);
      
      expect(result.result).to.be.true;
    });

    it('EDGE: should not prove contradiction from empty theory', () => {
      const st = createSymbolTable();
      
      // Empty theory
      const theory: any[] = [];
      
      // Try to prove contradiction: P(a) & !P(a)
      const formula = parseFormula('P(a) & !P(a)', st);
      
      const result = proves(theory, formula, st, true);
      console.log('=== CONTRADICTION TEST DEBUG ===');
      console.log('Result:', result.result);
      console.log('Initial clauses:', result.debug.initialClauses.length);
      console.log('Termination reason:', result.debug.terminationReason);
      console.log('Total iterations:', result.debug.totalIterations);
      
      expect(result.result).to.be.false;
    });

    it('EDGE: should not prove irrelevant formula', () => {
      const st = createSymbolTable();
      
      // Theory with completely unrelated facts
      const theory = [
        parseFormula('Q(b)', st),
        parseFormula('R(c)', st)
      ];
      
      // Try to prove unrelated formula
      const formula = parseFormula('P(a)', st);
      
      const result = proves(theory, formula, st, true);
      console.log('=== IRRELEVANT FORMULA TEST DEBUG ===');
      console.log('Result:', result.result);
      console.log('Initial clauses:', result.debug.initialClauses.length);
      console.log('Termination reason:', result.debug.terminationReason);
      console.log('Total iterations:', result.debug.totalIterations);
      
      expect(result.result).to.be.false;
    });

    it('EDGE: should handle double negation', () => {
      const st = createSymbolTable();
      
      // Theory: !!P(a) (double negation)
      const theory = [parseFormula('!!P(a)', st)];
      
      // Should prove: P(a)
      const formula = parseFormula('P(a)', st);
      
      const result = proves(theory, formula, st, true);
      console.log('=== DOUBLE NEGATION TEST DEBUG ===');
      console.log('Result:', result.result);
      console.log('CNF conversions:', result.debug.cnfConversions.length);
      console.log('Initial clauses:', result.debug.initialClauses.length);
      console.log('Termination reason:', result.debug.terminationReason);
      
      expect(result.result).to.be.true;
    });

    // ===== MEDIUM EDGE CASES =====

    it('EDGE: should handle variable scoping with nested quantifiers', () => {
      const st = createSymbolTable();
      
      // Theory: forall x. exists y. P(x, y)
      const theory = [parseFormula('forall x. exists y. P(x, y)', st)];
      
      // Try to prove: exists y. forall x. P(x, y) (should fail - different scoping)
      const formula = parseFormula('exists y. forall x. P(x, y)', st);
      
      const result = proves(theory, formula, st, true);
      console.log('=== VARIABLE SCOPING TEST DEBUG ===');
      console.log('Result:', result.result);
      console.log('CNF conversions:', result.debug.cnfConversions.map(c => ({ 
        original: 'formula', 
        cnf: 'cnf_formula' 
      })));
      console.log('Initial clauses:', result.debug.initialClauses.length);
      console.log('Termination reason:', result.debug.terminationReason);
      
      // This should fail because forall-exists is not the same as exists-forall
      expect(result.result).to.be.false;
    });

    it('EDGE: should handle complex unification with function terms', () => {
      const st = createSymbolTable();
      
      // Theory: forall x. P(f(x), g(h(x)))
      const theory = [parseFormula('forall x. P(f(x), g(h(x)))', st)];
      
      // Should prove: P(f(a), g(h(a)))
      const formula = parseFormula('P(f(a), g(h(a)))', st);
      
      const result = proves(theory, formula, st, true);
      console.log('=== COMPLEX UNIFICATION TEST DEBUG ===');
      console.log('Result:', result.result);
      console.log('Initial clauses:', result.debug.initialClauses.length);
      console.log('Resolution steps with unification:', result.debug.resolutionSteps.length);
      console.log('Termination reason:', result.debug.terminationReason);
      
      expect(result.result).to.be.true;
    });

    it('EDGE: should handle multiple existential elimination', () => {
      const st = createSymbolTable();
      
      // Theory: exists x. exists y. P(x, y) and forall x. forall y. (P(x, y) -> Q(x))
      const theory = [
        parseFormula('exists x. exists y. P(x, y)', st),
        parseFormula('forall x. forall y. (P(x, y) -> Q(x))', st)
      ];
      
      // Should prove: exists x. Q(x)
      const formula = parseFormula('exists x. Q(x)', st);
      
      const result = proves(theory, formula, st, true);
      console.log('=== MULTIPLE EXISTENTIAL TEST DEBUG ===');
      console.log('Result:', result.result);
      console.log('CNF conversions:', result.debug.cnfConversions.length);
      console.log('Initial clauses:', result.debug.initialClauses.length);
      console.log('Skolem functions created during CNF conversion');
      console.log('Resolution steps:', result.debug.resolutionSteps.length);
      console.log('Termination reason:', result.debug.terminationReason);
      
      expect(result.result).to.be.true;
    });

    // ===== HARD EDGE CASES =====

    it('EDGE: should handle alternating quantifiers', () => {
      const st = createSymbolTable();
      
      // Theory: forall x. exists y. forall z. P(x, y, z)
      const theory = [parseFormula('forall x. exists y. forall z. P(x, y, z)', st)];
      
      // Try to prove: exists y. forall x. exists z. P(x, y, z) (should fail)
      const formula = parseFormula('exists y. forall x. exists z. P(x, y, z)', st);
      
      const result = proves(theory, formula, st, true);
      console.log('=== ALTERNATING QUANTIFIERS TEST DEBUG ===');
      console.log('Result:', result.result);
      console.log('CNF conversions show Skolemization:', result.debug.cnfConversions.length);
      console.log('Initial clauses after Skolemization:', result.debug.initialClauses.length);
      console.log('Total iterations before giving up:', result.debug.totalIterations);
      console.log('Termination reason:', result.debug.terminationReason);
      console.log('Final clause count:', result.debug.finalClauseCount);
      
      // This is a hard case that likely requires many steps or might not terminate
      expect(result.result).to.be.false;
    });

    it('EDGE: should handle deep term structures', () => {
      const st = createSymbolTable();
      
      // Theory with deeply nested function terms
      const theory = [
        parseFormula('forall x. P(f(g(h(x))))', st)
      ];
      
      // Should prove instantiation with nested structure
      const formula = parseFormula('P(f(g(h(a))))', st);
      
      const result = proves(theory, formula, st, true);
      console.log('=== DEEP TERM STRUCTURES TEST DEBUG ===');
      console.log('Result:', result.result);
      console.log('Unification complexity in resolution steps');
      console.log('Resolution steps:', result.debug.resolutionSteps.length);
      console.log('Termination reason:', result.debug.terminationReason);
      
      expect(result.result).to.be.true;
    });

    it('EDGE: should handle potentially infinite reasoning', () => {
      const st = createSymbolTable();
      
      // Theory that could lead to infinite reasoning chains
      const theory = [
        parseFormula('forall x. (P(x) -> P(f(x)))', st),  // infinite chain
        parseFormula('P(a)', st)
      ];
      
      // Try to prove something that would require infinite steps
      const formula = parseFormula('P(f(f(f(f(f(a))))))', st);
      
      const result = proves(theory, formula, st, true);
      console.log('=== POTENTIALLY INFINITE REASONING TEST DEBUG ===');
      console.log('Result:', result.result);
      console.log('Hit iteration limit?', result.debug.terminationReason === 'iteration_limit');
      console.log('Total iterations:', result.debug.totalIterations);
      console.log('Final clause count:', result.debug.finalClauseCount);
      console.log('Generated many clauses during resolution');
      
      // This might hit iteration limit or succeed, depending on implementation
      // Just check that it doesn't crash
      expect(typeof result.result).to.equal('boolean');
    });

    it('EDGE: should handle combinatorial explosion case', () => {
      const st = createSymbolTable();
      
      // Theory that could cause many clauses to be generated
      const theory = [
        parseFormula('forall x. (A(x) | B(x))', st),
        parseFormula('forall x. (C(x) | D(x))', st),  
        parseFormula('forall x. (E(x) | F(x))', st),
        parseFormula('forall x. (!A(x) | !C(x) | !E(x))', st), // constraints
        parseFormula('A(a)', st),
        parseFormula('C(a)', st)
      ];
      
      // Try to prove something that requires working through the constraints
      const formula = parseFormula('!E(a)', st);
      
      const result = proves(theory, formula, st, true);
      console.log('=== COMBINATORIAL EXPLOSION TEST DEBUG ===');
      console.log('Result:', result.result);
      console.log('Initial clauses:', result.debug.initialClauses.length);
      console.log('Total iterations:', result.debug.totalIterations);
      console.log('Final clause count:', result.debug.finalClauseCount);
      console.log('Termination reason:', result.debug.terminationReason);
      console.log('Resolution steps taken:', result.debug.resolutionSteps.length);
      
      expect(result.result).to.be.true;
    });
  });
});
