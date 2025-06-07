# Gödel Meets TypeScript

![squirrel](https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Ftse3.mm.bing.net%2Fth%3Fid%3DOIP.qnOXFFvpzh4ArqV2NuqF5gHaE8%26pid%3DApi&f=1&ipt=265c16d4a7f965b9255a8ff3bd8f0d6d6e7236617f83d3d643c36b4ae595e1ee&ipo=images)

This repo contains a proof of Gödel's two incompleteness theorems, written in TypeScript. If you already know what that means and just want to see what this thing does, skip to [usage](#usage). Otherwise, read the [background](#background) first for a somewhat fictitious account of the history of these two theorems.

## Quickstart

Needs to be written once there's something to quickstart.

## Background

Gödel's incompleteness theorems are fascinating discoveries about the nature of logic and mathematics. For a long time mathematicians (like Hilbert) were convinced that the structure of any argument could be represented by a series of small logical steps, starting from a few assumptions (your *axioms*) and eventually ending up at a conclusion (a *theorem*). Each logical step had to consist of one of a small number of *inference rules*, like *Modus Ponens*:

- $\mathbf{(MP)}$ if $A \implies B$, and $A$, then conclude $B$

The advantage of these systems is that they are simple enough to reason about, which means that you can use mathematics to study itself! In particular, many hoped that the study of *logic* (which is what this field came to be known as) would eventually yield that holy grail of philosophy - a proof that logic and reasoning itself is *internally self-consistent*.

It's hard to overstate what a magic trick this would be. The ability for a logic to represent *itself* and prove *itself* consistent would be to tame a fractal nightmare of self-referential logical chaos. Think of simple puzzles like the liar's paradox:

- $\mathbb{(LP)}$ This sentence is false.

It's not hard to see that this sentence cannot have a truth value. If it's true then it's false, and if it's false then it's true. Allowing statements to refer to themselves is a *really* bad idea if you want a provably-consistent logic, because you need to have answers to internal versions of these paradoxes. And they get *much* worse than this one.

The goal of these formalists was simple, then. They wanted to find a set of axioms and inference rules that had the following properties:

1. it could encode all of mathematics
2. it was simple enough to reason about
3. it could prove itself internally consistent

From an academic point of view this program is very attractive. You have an enormous number of choices of logic to explore, and if one doesn't pan out you can just move on to analysing the next. Infinite papers! This led to a proliferation of different kinds of logics being used to analyse different kinds of arguments - there's first-order logic, temporal logic, modal logics, logics of provability, logics for non-monotonic reasoning, logics for just about anything you could ever dream of having an opinion on. In a fit of mania I once added a logic called *Defeasible-Restricted First-Order Logic* to the pile. It's like a rite of passage for studying this stuff.

Elsewhere in the world of thought, people like Turing and Kleene were studying something very different - *computability*. Much like the logicians, they were interested in things that performed many small steps in succession, but rather than inference rules these steps were simple mathematical operations. These days we call devices that do this *computers*, and they are so familiar to us that it's hard to imagine a time where people had only just begun to conceive of them.

Unlike the logicians, computer scientists *love* self-reference. Allowing programs to reference themselves (called *recursion* or *reification* depending on the context) is such a powerful technique for writing code that entire languages have been based around the idea, like Lisp. For the completely uninitiated, here's an example of a self-referential program that computes the Fibonacci sequence:

```typescript
// TODO: transpiler example
function fib(n: number): number {
    if (n < 2) return 1;
    return fib(n-1) + fib(n-2);
}
```

Kleene managed to prove some interesting results about recursive programs, such as *Kleene's recursion theorem*. Informally, this says that if you have a *higher-order program* $F$ - which is a program that takes in a program $x$ as input and returns a new transformed program $F(x)$ - then there is always a program $x$ such that $x$ and $F(x)$ have exactly the same behaviour. In other words, no matter how you code up a program transformer, there will always be *some* program out there that is unaffected by it.

The ingenious idea of Kurt Gödel was noticing that despite these different contexts and attitudes towards self-reference, there were in fact very close links between the study of logic and the study of computation. By carefully blending the two theories together and seasoning to taste, he managed to prove a shocking result:

- $\mathbf{(FIT)}$ if a logic is capable of representing arithmetic, and its set of axioms and inference rules is computable, then that logic contains a true, self-referential formula that cannot be proven

This is *Gödel's first incompleteness theorem*. Already, this was a shattering blow to the formalist program, as it meant that there was no hope for a logic that could universally encode mathematical argument. Nevertheless, there was still some hope to find a logic that was "good enough", in the sense that all of the *relevant* mathematics could be encoded. The true but unprovable formula that you get out of the first incompleteness theorem is highly artificial, and it wasn't clear that any *natural* mathematical statements would end up being problematic.

This little ray of sunshine and copium was firmly squashed by the *second incompleteness theorem*:

- $\mathbf{(SIT)}$ if a logic is capable of representing arithmetic, and its set of axioms and inference rules is computable, then that logic cannot prove itself consistent *even if it is true*

It turns out that consistency itself is one of these formulas! Unfortunately this seems to leave the formalist program with very few options. The two that come to my mind are:

1. radically reinvent your idea of what a logic is to avoid self-reference
2. accept incompleteness into your heart, and think like Terry Pratchet

The first point has, to my knowledge, not really panned out in any serious fashion. Self-reference appears to be a crucial part of both computation and logic, and by cutting it out you end up cutting yourself. There are logics that can prove their own consistency out there, but they are either far too weak to be of any use to the formalists, or they make use of incomputable sets of axioms and inference rules which cannot be reasoned about effectively. The most compelling attempts I've seen involve non-binary logics like probability theory (which you can think of as a kind of logic à la Jaynes), but most mathematicians would reject the idea that the correctness of a proof can only ever exist on a continuum, I think.

The second point refers to things like *Gentzen's theorem*, which states that *Peano Arithmetic* (a logic for proving properties of natural numbers) is consistent, which requires the use of a second, more powerful logical system to actually implement the proof. You can prove that something is consistent like this, but you might still have doubts about the second system. To prove the second system consistent requires a third, and the third requires a fourth, and pretty soon it's turtles all the way down. This sort of infinite regress is very unsatisfactory as a model of mathematics.

### Peano Arithmetic

The proof of the incompleteness theorem is not actually that complicated when you get down to it, especially if you take some liberties (which I do here). As logicians, people like Gödel and Rosser worked hard to find the exact dividing line between completeness and incompleteness. This is a very interesting thing to do, but leads to a pretty difficult-to-read proof (not to mention that a lot of the terminology has since gone out of fashion).

The basic idea is to show that certain questions about logic, like "is $\phi$ a valid proof of $\psi$ in this logic?", can be mechanically translated into questions about natural numbers, in such a way that the two questions are completely equivalent. By *mechanically* I just mean that there is a computer program that can do it, and by *equivalent* I mean that the answer to both questions must be exactly the same.

This is already quite interesting, as it means that we can translate many questions about truth, proof and consistency into much simpler questions about number theory! At first glace you might be surprised that this is possible, but keep in mind that if you are a programmer your compiler does this all the time. A compiler takes some high-level code (like a Haskell program, for instance) and converts it into a low-level representation (such as machine code). The only difference here is that instead of machine code, Gödel uses number theory as his target architecture.

To give you a flavour of what this looks like, you probably already know the following result (the *fundamental theorem of arithmetic*):

- $\mathbf{(FTA)}$ every positive natural number has a unique prime factorisation

Let's use this to construct a simple coding scheme for strings. Ignoring a lot of details, a string is basically a sequence of *bytes*, which can range in value from $0-255$. If the $i$-th byte of the string has value $v_i$, we associate it with the number $p_i^{1 + v_i}$, where $p_i$ is the $i$-th prime number. To encode the string, we simply take the product of all of the prime powers associated with each byte:

```typescript
const ps = [2, 3, 5, 7, 11, 13, 17, 19, 23];
function encode(xs: number[]): number {
  return xs.reduce((res, x, i) => res * ps[i]**(1 + x), 1);
}
console.log(encode([1, 2, 3])); // 67500 = 2**(1+1) * 3**(2+1) * 5**(3+1)
```

To decode these numbers you simply factorise the input and work out each byte's value in reverse:

```typescript
const ps = [2, 3, 5, 7, 11, 13, 17, 19, 23];
function decode(x: number): number[] {
  const res = [];
  for (let i = 0; x > 1 && i < ps.length; i++) {
    for (var cnt = 0; x%ps[i] == 0; (x /= ps[i], cnt++));
    res.push(cnt ? cnt-1 : 0);
  }
  return res;
}
console.log(decode(67500)); // [1, 2, 3]
```

Because of the $\mathbb{(FTA)}$, this is guaranteed to work as an encoding for any finite string of bytes. But these examples are written in TypeScript - the real demonstration is to show that this codec can be represented as formulas of arithmetic as well. To keep our lives simple, I will be working with *first-order Peano Arithmetic*, a well-known logic for working with natural numbers.

TODO: link to a good introduction to first-order logic, not the place to do it here

The language of Peano Arithmetic consists of a constant $0$ (zero), a binary relation $=$ (equality), a unary function $S$ (the *successor function*) and two binary functions $+$ and $\cdot$ (addition and multiplication). In terms of axioms, there are six that ensure that all of these symbols behave the way you would expect from $\mathbb{N}$:

1. $\forall x . \left( 0 \neq S(x) \right)$
2. $\forall x, y . \left( S(x) = S(y) \implies x = y \right)$
3. $\forall x . \left( x + 0 = x \right)$
4. $\forall x, y . \left( x + S(y) = S(x + y) \right)$
5. $\forall x . \left( x \cdot 0 = 0 \right)$
6. $\forall x, y . \left( x \cdot S(y) = x \cdot y + x \right)$

...as well as a few axioms ensuring that equality behaves correctly:

7. $\forall \left( x . x = x \right)$
8. $\forall x, y . \left( x = y \implies y = x \right)$
9. $\forall x, y, z . \left( x = y \land y = z \implies x = z \right)$

...and finally, it has an *axiom schema*, which is a fancy way of describing a computable, infinite *set* of axioms. This particular schema is called the *axiom schema of induction*:

10. for every formula $\varphi(x)$ we have as an axiom $\left( \varphi(0) \land \forall x . \left( \varphi(x) \implies \varphi(S(x)) \right) \right) \implies \forall x . \varphi(x)$

## Usage

Needs to be written when there's something to use.
