---
name: property-search
description: Turns a property search sentence into filters. It does not search listings.
---

# Property search

When someone asks for property filters, run this with their exact query:

```powershell
node --experimental-strip-types skills/property-search/cli.ts 'Show me 3-bedroom condos in Irvine under $1.5M with a pool'
```

Return the JSON it prints. `null` means the person did not mention that filter. This skill only makes filters, so do not say it found any listings.

The code is in `parse-property-query.ts`. These filters match the `rets_property` fields:

- `city` → `L_City`; `maxPrice` → `L_SystemPrice`; `beds` → `L_Keyword2`
- `baths` → `LM_Dec_3`; `sqft` → `LM_Int2_3`; `type` → `L_Type_`
- `pool` → `PoolPrivateYN`; `hasView` → `ViewYN`; `maxHOA` → `AssociationFee`
