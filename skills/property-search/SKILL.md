---
name: property-search
description: Handle multi-turn property searches from WhatsApp or chat, remember each sender's preferences, and return live MLS listings. Also supports one-shot active and sold searches.
---

# Property search

For a WhatsApp property search, run the chat command once per incoming message. Use the sender's stable WhatsApp ID for `--user`, and pass the exact message for `--message`. Use the same sender ID on every turn. Reply with the command's output exactly; it may be a follow-up question or live property cards. Do not invent listings. Keep different senders' IDs separate.

From PowerShell:

```powershell
Set-Location 'C:\Users\ragha\Documents\IDX-Exchange-Agentic-AI'
npm.cmd run chat -- --user 'sender-id' --message 'Find homes in Irvine'
```

Replace the sender ID and example sentence with the incoming message. Wrap each in single quotes and double any apostrophe inside it for PowerShell. When the person replies, run the same command with their next message. They can say `more` for the next page or `start over` to clear their search. Sessions are saved under `.sessions` in the project and are separate for each sender.

For a one-shot active search, run:

```powershell
npm.cmd run search -- 'Show me 3-bedroom condos in Irvine under $1.5M with a pool'
```

For sold homes, add `--sold`. A city is required. The default window is 12 months, and `--months 6` changes it.

```powershell
npm.cmd run search -- 'sold homes in Irvine' --sold --months 12 --limit 3
```

Results have numbered cards and a total. If the person asks for more, rerun with `--page 2`. `--limit` can be 1 through 25. If the command returns no matches or an error, say so plainly. The database credentials are read from the project's .env file.
