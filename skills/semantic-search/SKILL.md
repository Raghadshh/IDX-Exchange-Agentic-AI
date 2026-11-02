---
name: semantic-search
description: Find the five most semantically similar active California listings for a free-text home description using local embeddings and cosine similarity.
---

# Semantic property search

For a descriptive request such as "charming craftsman with mountain views and character", use OpenClaw's shell exec tool. The semantic-search skill is not itself a callable tool.

From PowerShell, run:

    Set-Location 'C:\Users\ragha\Documents\IDX-Exchange-Agentic-AI'
    npm.cmd run semantic -- 'charming craftsman with mountain views and character'

Replace the sample description with the exact incoming request. Quote it for PowerShell and double any apostrophe inside it. Return only the five real active listings from the command, including their cosine scores. A cosine score is a similarity measure, not a probability. Do not invent matches. The local embedding model and index use no Gemini or OpenAI API calls. If the index is missing, tell the user to run npm.cmd run semantic:index in the project terminal; do not start the long build from WhatsApp.