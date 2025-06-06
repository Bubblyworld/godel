# Gödel Meets TypeScript

This repo contains a proof of Gödel's two incompleteness theorems, written in TypeScript. If you already know what that means and just want to see what this thing does, skip to [usage](#usage). Otherwise, read the [background](#background) first for a somewhat fictitious account of the history of these two theorems.

## Quickstart

Needs to be written once there's something to quickstart.

## Background

Gödel's incompleteness theorems are fascinating discoveries about the nature of logic and mathematics. For a long time mathematicians (like Hilbert) were convinced that the structure of any argument could be represented by a series of small logical steps, starting from a few assumptions (your *axioms*) and eventually ending up at a conclusion (a *theorem*). Each logical step had to consist of one of a small number of *inference rules*, like *Modus Ponens*:

- $\mathbf{(MP)}$ if $A \implies B$, and $A$, then conclude $B$

The advantage of these systems is that they are simple enough to reason about, which means that you can use mathematics to study itself! In particular, many hoped that the study of *logic* (which is what this field came to be known as) would eventually yield that holy grail of philosophy - a proof that logic and reasoning itself is *internally self-consistent*.

It's hard to overstate what a magic trick this would be. The ability for a logic to represent *itself* and prove *itself* consistent would be to tame a fractal nightmare of self-referential logical chaos. Think of simple puzzles like the liar's paradox:

- This sentence is false.

It's not hard to see that this sentence cannot have a truth value. If it's true then it's false, and if it's false then it's true. Allowing statements to refer to themselves is a *really* bad idea if you want a provably-consistent logic, because you need to have answers to internal versions of these paradoxes. And they get *much* worse than this one.

The goal of these formalists was simple, then. They wanted to find a set of axioms and inference rules that had the following properties:

1. it could encode all of mathematics
2. it was simple enough to reason about
3. it could prove itself internally consistent

From an academic point of view this program is very attractive. You have an enormous number of choices of logic to explore, and if one doesn't pan out you can just move on to analysing the next. Infinite papers! This led to a proliferation of different kinds of logics being used to analyse different kinds of arguments - there's first-order logic, temporal logic, modal logics, logics of provability, logics for non-monotonic reasoning, logics for just about anything you could ever dream of having an opinion on. In a fit of mania I once added a logic called *Defeasible-Restricted First-Order Logic* to the pile. It's like a rite of passage for studying this stuff.

Elsewhere in the world of thought, people like Turing and Kleene were studying something very different - *computability*. Much like the logicians, they were interested in things that performed many small steps in succession, but rather than inference rules these steps were simple mathematical operations. These days we call devices that do this *computers*, and they are so familiar to us that it's hard to imagine a time where people had only just begun to conceive of them.

Unlike the logicians, computer scientists *love* self-reference. Allowing programs to reference themselves (called *recursion* or *reification* depending on the context) is such a powerful technique for writing code that entire languages have been based around the idea, like Lisp. Here's an example of a self-referential program that computes the Fibonacci sequence:

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

## Usage

Needs to be written when there's something to use.
