# IDX Exchange Agentic AI

AI Agentic Engineer internship project for IDX Exchange.

This repo has my work for the IDX Exchange AI Agentic Engineer internship.

## Module 2: Property search filters

The skill in `skills/property-search/` turns a normal property search sentence into filters for `rets_property`. The database search comes later.

Use Node.js 24 or newer. Run this in the VS Code PowerShell terminal:

```powershell
npm.cmd install
npm.cmd run verify
```

This checks the TypeScript and prints the results for all 14 test queries. To try your own query, run:

```powershell
node --experimental-strip-types skills/property-search/cli.ts 'Show me 3-bedroom condos in Irvine under $1.5M with a pool'
```
