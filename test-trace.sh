#!/bin/bash

export DEBUG_PROVER=true
export DEBUG_PROVER_LEVEL=TRACE
npm run test -- -f $1
