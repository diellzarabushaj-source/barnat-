# Mjetet rreth DRx

Ky dokument mban dy gjëra të ndara: çfarë është **instaluar në këtë repo** dhe
çfarë rri **jashtë tij**, me komandat e sakta të marra nga README-t e projekteve
përkatëse.

Ndarja nuk është kapriço. DRx është frontend statik (HTML, CSS, JavaScript) para
funksioneve Node në Vercel, me Supabase si bazë të dhënash. Nuk ka runtime Python
dhe nuk ka server që e mbajmë vetë. Çdo gjë që kërkon Python, Docker ose një
proces të gjatë nuk mund të jetojë brenda këtij deployment-i, sado i dobishëm të
jetë si mjet.

---

## Pjesa 1 — E instaluar në repo

### Skills (68)

Instalohen me `npx skills add <owner>/<repo>`. Trupat rrinë te `.agents/skills/`,
ndërsa `.claude/skills/` mban symlink-e drejt tyre. Regjistri është
`skills-lock.json`.

| Burimi | Çfarë sjell |
| --- | --- |
| `Leonxlnx/taste-skill` | paketat e dizajnit që përdorëm për faqen DRx |
| `obra/superpowers` | cikli i zhvillimit: brainstorming, plane, TDD, debugging, rishikim kodi, verifikim para përfundimit |
| `WorldFlowAI/everything-claude-code` | standarde kodimi, frontend/backend patterns, security review |
| `wshobson/agents` | vetëm nënbashkësia që prek këtë stack — shih më poshtë |
| `anthropics/skills` | frontend-design, webapp-testing, skill-creator, mcp-builder, theme-factory, pdf, xlsx, pptx |
| `Astro-Han/karpathy-llm-wiki` | bazë njohurish me citime |
| `swarmclawai/andrej-karpathy-skills` | udhëzime sjelljeje kundër ndërlikimit të tepërt |
| `virgiliojr94/book-to-skill` | shndërron një libër në skill |
| `blader/humanizer` | heq gjurmët e shkrimit të gjeneruar nga AI |

Nga `wshobson/agents` u mbajtën vetëm ato që prekin këtë projekt:
qasshmëria dhe auditimi WCAG, testimi me screen reader, dizajni responsiv,
JavaScript modern, testimi me Jest dhe Playwright, trajtimi i gabimeve,
debugging, autentikimi, dizajni i API-ve, Node backend, skema dhe optimizimi i
PostgreSQL, migrimet e bazës, sekretet, GDPR, tailwind, themelet e dizajnit
vizual, ai-debt-detector dhe session-guard.

Nga 239 skills që sollën këto pakete bashkë, 171 u hoqën. Emri dhe përshkrimi i
çdo skill-i ngarkohen në kontekstin e agjentit në çdo rradhë; mbajtja e skills-ave
për Solidity, NFT, Unity, Godot, Spark, Kubernetes ose kontrata punësimi do të
hante kontekst pa i dhënë asgjë një regjistri klinik.

**Shtimi i një skill-i të ri:**

```bash
npx skills add <owner>/<repo>
```

Pas çdo shtimi, kontrollo çfarë erdhi vërtet (`ls .agents/skills`) dhe hiq atë që
nuk i shërben projektit — pastaj sinkronizo `skills-lock.json`.

### Subagjentë (20)

Te `.claude/agents/`, nga `contains-studio/agents`: kategoritë engineering,
testing, design dhe product. Marketing, studio-operations, project-management dhe
bonus u lanë jashtë. Katër agjentët `impeccable-*` ishin aty më parë.

### Playwright MCP

Deklaruar te `.mcp.json`, i lidhur me Chromium-in që ekziston te
`/opt/pw-browsers`, që serveri të mos shkarkojë shfletues të dytë.

### Repomix

```bash
pnpm repomix
```

Paketon repon në një skedar të vetëm për t'ia dhënë një modeli.
`repomix.config.json` përjashton bundle-t e gjeneruara, snapshot-in ICD, fontet,
artin e markës dhe pemët e skills-ave. Output-i është artefakt dhe rri te
`.gitignore`.

---

## Pjesa 2 — Jashtë repos

### Frameworks agjentësh në Python

LangGraph, DSPy, Pydantic-AI dhe CrewAI janë paketa Python. DRx nuk ekzekuton
Python askund: funksionet në Vercel janë Node. Prandaj asnjëra nuk është shtuar
si varësi — do të ishte kod i vdekur brenda një aplikacioni klinik.

```bash
pip install langgraph      # grafe gjendjeje për agjentë me shumë hapa
pip install dspy           # optimizim programatik i prompt-eve, me metrika
pip install pydantic-ai    # agjentë me dalje të tipizuar rreptësisht
pip install crewai         # ekipe agjentësh me role (Python >=3.10,<3.14)
```

**Para se t'i përdorim:** DRx tashmë ka një veti LLM në Node —
`api/gemini-prescription-secure.js`. Nëse na duhet orkestrim agjentësh, ka dy
rrugë të ndershme:

1. **Në Node, pranë kodit ekzistues.** LangGraph ka port JavaScript
   (`@langchain/langgraph`), dhe Vercel AI SDK mbulon shumicën e nevojave.
   Një runtime, një deployment, asnjë kufi rrjeti i ri.
2. **Një shërbim Python veç**, i vendosur diku tjetër (Railway, Fly, Render).
   Fuqia e plotë e ekosistemit Python, por me çmim: deployment i dytë, CI i
   dytë, dhe një kufi rrjeti mes tij dhe Supabase-it — që për të dhëna klinike
   do të thotë një sipërfaqe më shumë për të siguruar.

Vendimi nuk merret në abstrakt. Merret kur të dimë cilën veti konkrete duam.

### Dify — platformë LLM me ndërfaqe

Kërkon Docker dhe të paktën 4 GiB RAM.

```bash
git clone https://github.com/langgenius/dify.git
cd dify/docker
cp .env.example .env
docker compose up -d
```

### screenshot-to-code

Shndërron një pamje ekrani në kod. Kërkon një çelës API (OpenAI, Anthropic ose
Gemini).

```bash
git clone https://github.com/abi/screenshot-to-code.git
cd screenshot-to-code/backend
echo "OPENAI_API_KEY=sk-..." > .env
poetry install
poetry run playwright install --with-deps chromium
poetry run uvicorn main:app --reload --port 7001
```

Në një terminal të dytë:

```bash
cd screenshot-to-code/frontend
pnpm install
pnpm dev        # http://localhost:5173
```

### OpenClaw

Asistent AI për kompjuterin tënd.

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
# ose
npm install -g openclaw@latest --allow-scripts=openclaw
```

### Claude Squad

Menaxhon disa agjentë terminali njëherësh. Binar Go, jo pjesë e repos:
<https://github.com/smtg-ai/claude-squad>

### awesome-claude-code

Listë leximi, jo program: <https://github.com/hesreallyhim/awesome-claude-code>

---

## Pjesa 3 — Kërkojnë komanda slash

Këto janë plugin-e të Claude Code dhe instalohen nga vetë sesioni, jo nga
terminali.

**TDD Guard** — bllokon shkrimin e kodit derisa të ekzistojë një test që dështon.

```
/plugin marketplace add nizos/tdd-guard
/plugin install tdd-guard@tdd-guard
/tdd-guard:setup
```

Kujdes me këtë repo: `pnpm test` varet nga `pretest`, i cili ekzekuton
`build:runtime` dhe rishkruan 59 skeda të gjurmuara në vend. Bllokimi automatik
do të përplaset me atë hap, ndaj priteshin rregullime në konfigurim.

**claude-subconscious** — kujtesë e vazhdueshme mes sesioneve.

```
/plugin marketplace add letta-ai/claude-subconscious
/plugin install claude-subconscious@claude-subconscious
export LETTA_API_KEY="..."
```

Kërkon një çelës nga [app.letta.com](https://app.letta.com) dhe dërgon kontekst
bisede te retë e Letta-s për ta ruajtur. Në një aplikacion klinik ai kontekst
mund të përmbajë të dhëna pacientësh ose dokumente verifikimi mjekësh. Vendos me
vetëdije se ku shkojnë ato të dhëna para se ta ndezësh.
