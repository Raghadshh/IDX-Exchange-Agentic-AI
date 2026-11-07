---
name: recommendation
description: Recommend five active listings like a given MLS listing using detail and embedding scores, with a recent sold-price check.
---

# Listing recommendations

For a request like "Recommend homes similar to MLS 1178201812", run the existing local command with OpenClaw's shell exec tool:

    Set-Location 'C:\Users\ragha\Documents\IDX-Exchange-Agentic-AI'
    npm.cmd run recommend -- --mls '1178201812'

Replace the example MLS number with the one supplied by the user. Return the five actual listings and their comp assessments from the command. Do not invent listings or prices. If the user gives no MLS number, ask for one. This command reads the local MLS database and Week 6 embedding index; it does not call an embedding API.
