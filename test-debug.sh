#!/bin/bash

# Run the Peano test with debug logging enabled
export DEBUG_PROVER=true
export DEBUG_PROVER_LEVEL=DEBUG

echo "Running Peano test with debug logging..."
npm run test -- -f Peano
