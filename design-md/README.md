# Biblioteka DESIGN.md (awesome-design-md)

Koleksion referencë me 74 sisteme dizajni në formatin `DESIGN.md`, i marrë nga
[voltagent/awesome-design-md](https://github.com/voltagent/awesome-design-md)
(commit `8147538`, licencë MIT — shih `design-md/LICENSE`).

`DESIGN.md` është format markdown që përshkruan ngjyrat, tipografinë, hapësirat, radiuset
dhe komponentët e një faqeje, në mënyrë që agjentët e AI ta ndjekin të njëjtën gjuhë vizuale.

## Si përdoret

Kjo bibliotekë është **vetëm referencë**. Ajo **nuk e zëvendëson** dizajnin zyrtar të MedIndex:
burimi i vetëm i miratuar mbetet `.superdesign/design-system.md`
(MedIndex TailAdmin Clinical Design System).

Përdore kështu:

1. Zgjidh një sistem nga tabela më poshtë, p.sh. `design-md/linear.app/DESIGN.md`.
2. Referoje në kërkesën ndaj agjentit, p.sh.
   _"Lexo `design-md/stripe/DESIGN.md` dhe propozo si mund të përmirësohet hierarkia e tabelës,
   duke ruajtur tokenët e MedIndex nga `.superdesign/design-system.md`."_
3. Merr prej saj ide për ritëm, hierarki ose komponentë — jo ngjyrat e markës.
   Teal-i i MedIndex, Inter dhe rregullat klinike mbeten të pandryshuara.

Çdo dosje përmban `DESIGN.md` (sistemi i plotë) dhe zakonisht një `README.md` përmbledhës.

## Shënime

- Dosja `design-md/` është material zhvillimi: nuk lidhet nga asnjë faqe, nuk hyn në build (`pnpm run build:runtime`) dhe nuk prek runtime-in klinik.
- Emrat, markat dhe ngjyrat u përkasin kompanive përkatëse; koleksioni është analizë publike
  e faqeve të tyre dhe nuk duhet kopjuar drejtpërdrejt në ndërfaqen e MedIndex.

## Katalogu

| Dosja | Përshkrimi |
| --- | --- |
| `airbnb` | A warm, generous consumer marketplace anchored on a clean white canvas and Airbnb Rausch (#ff385c), the single brand voltage that carries every primary CTA, search-button orb, and  |
| `airtable` | A sober, editorial workflow-software interface anchored on white canvas and dark-ink type, where brand voltage comes from full-bleed signature cards in coral, dark green, peach, an |
| `apple` | A photography-first interface that turns marketing into a museum gallery. |
| `binance` | A confident financial-platform interface anchored on a deep near-black canvas, where Binance's iconic yellow (#FCD535) carries every primary CTA, brand accent, and value-claim mome |
| `bmw` | BMW's corporate site — distinct from BMW M's motorsport-bombastic variant, this is a measured and settled corporate-automotive interface. |
| `bmw-m` | A motorsport-engineering interface anchored on a near-black canvas with white BMW Type Next Latin display headlines in confident UPPERCASE. |
| `bugatti` | An austere luxury-automotive interface that uses near-pure black canvas, white uppercase letterspaced display, and full-bleed automotive photography as the only voltage. |
| `cal` | A clean, calendar-software-first interface anchored on white canvas with black primary CTAs and custom Cal Sans display typography. |
| `claude` | A warm-canvas editorial interface for Anthropic's Claude product. |
| `clay` | A vibrant claymation-meets-data interface for Clay.com (GTM data-orchestration platform). |
| `clickhouse` | A high-performance database interface anchored on near-pure black canvas with electric yellow as the brand voltage. |
| `cohere` | Cohere's 2026 web system is a controlled enterprise AI interface built from stark white editorial space, deep green-black product bands, soft mineral surfaces, rounded media cards, |
| `coinbase` | An institutional-grade crypto exchange whose marketing surfaces read like a quietly-confident financial-services brand. |
| `composio` | A developer-tools brand for AI-agent tool integration whose marketing surfaces lean into a dark, technical aesthetic with a single deep-electric-blue voltage (#0007cd). |
| `cursor` | An AI-first code editor whose marketing site reads like a quietly-confident developer-tools brand with a warm-cream editorial canvas (#f7f7f4) instead of the typical dark IDE atm |
| `dell-1996` | An inspired interpretation of Dell.com's 1996 design language — a catalog-era enterprise web design built around a literal black page frame, vivid flat color-block "ribbon cards" t |
| `elevenlabs` | A voice-AI brand whose marketing surfaces read like a quietly editorial print magazine. |
| `expo` | A React Native developer-platform whose marketing site reads like a quietly-confident infrastructure brand. |
| `ferrari` | A luxury-automotive brand whose marketing surfaces read as cinematic editorial. |
| `figma` | A confident black-and-white editorial frame interrupted by oversized, hand-cut pastel color blocks. |
| `framer` | A confident dark-canvas builder marketing site that treats the page like a working artboard — pure black surfaces, white display type set in GT Walsheim Medium with aggressive nega |
| `hashicorp` | An enterprise-infrastructure marketing canvas built around a near-black ground (#000000) and a system of per-product accent colors — Terraform purple, Vault yellow, Consul pink, Wa |
| `hp` | An inspired interpretation of HP's design language — a white-paper enterprise-consumer system anchored by HP Electric Blue (#024ad8) as the lone signal CTA, near-black ink (#1a1 |
| `ibm` | An enterprise-marketing canvas faithful to Carbon Design System: white surfaces, charcoal type, IBM Blue (#0f62fe) as the single confident accent, and a deliberately flat-square ae |
| `intercom` | An editorial customer-service marketing canvas built around a soft cream-white ground, charcoal type set in Saans (Intercom's proprietary geometric sans), and a single confident Fi |
| `kraken` | Kraken's website is a clean, trustworthy crypto exchange that uses purple as its commanding brand color. |
| `lamborghini` | Lamborghini's website is a cathedral of darkness — a digital stage where jet-black surfaces stretch infinitely and every element emerges from the void like a machine under a spotli |
| `linear.app` | A near-black product-focused marketing canvas built around #010102 (the deepest dark surface of any tool in this collection), light gray text (#f7f8f8), and the signature Linear la |
| `lovable` | Lovable's website radiates warmth through restraint. |
| `mastercard` | Mastercard's experience reads like a warm, editorial magazine built from soft stone and signal orange. |
| `meta` | Meta's design system spans hardware commerce (Quest VR, Ray-Ban Meta AI glasses) and brand surfaces with a confident product-merchandising voice. |
| `minimax` | MiniMax presents itself as a premium AI infrastructure brand through a striking duality — bold black-pill CTAs and stark white canvas for marketing, paired with vibrant gradient pr |
| `mintlify` | Mintlify presents documentation infrastructure with a dual-mode aesthetic — atmospheric sky-gradient marketing heroes (cloud illustration backdrops, soft cream-to-blue washes) pair |
| `miro` | Miro presents itself as the AI-powered visual workspace through a confident, almost playful brand voice — anchored by its signature canary yellow ({colors.brand-yellow}) wordmark o |
| `mistral.ai` | Mistral AI brands itself with a singular signature — atmospheric sunset gradients (mustard, orange, deep red) layered over photography of mountains, plus a horizontal "sunset strip |
| `mongodb` | MongoDB carries a strong dual-mode visual identity — dark deep-teal hero bands with bright MongoDB green ({colors.brand-green}) CTAs paired with stark white documentation surfaces. |
| `nike` | / A photography-first commerce system built on extreme typographic contrast — towering uppercase Futura display lockups burned into editorial campaign imagery, sitting above a dens |
| `nintendo-2001` | An analysis of Nintendo.com's 2001 design language — a brushed-periwinkle "console chrome" interface where every panel is a beveled metal plate, navigation glows amber over a halft |
| `notion` | Notion presents itself as the all-in-one workspace through a confident, illustration-rich brand voice — anchored by a deep navy hero band ({colors.brand-navy}) decorated with brand |
| `nvidia` | / An engineering-grade marketing system organized around two surface modes — a deep black canvas for hero and footer chapters and a flat paper-white canvas for body content — conne |
| `ollama` | / An almost defiantly minimal documentation-first system that treats the home page like a Markdown README — paper-white canvas, 36px center-aligned heading, a single black pill CTA |
| `opencode.ai` | / A terminal-native marketing system rendered entirely in Berkeley Mono — every word on the page, from the hero headline down to the footer fine print, is monospaced. |
| `pinterest` | / A photography-first discovery system organized around the Pinterest Red CTA, the masonry pin grid, and a soft warm-cream chrome that gets out of the imagery's way. |
| `playstation` | / A three-surface marketing system organized around alternating black, white, and PlayStation Blue chapters that scroll past the viewer like a console launch trailer. |
| `posthog` | / A playful developer-tools system rendered on a warm cream canvas with hand-drawn hedgehog mascots dotted across every page like marginalia in a sketchbook. |
| `raycast` | / Raycast's marketing system reads like an extended product screenshot. |
| `renault` | / Renault's web presence pairs the freshly-modernised Renault diamond (the 2021 flat-line rhombus mark) with a stark black-and-white canvas, a signature Sunlight Yellow accent, and |
| `replicate` | / Replicate's marketing surfaces pair the warm-cream developer-tools aesthetic of an indie ML playground with a confident hot-orange brand accent and a signature display typeface ( |
| `resend` | / Resend's marketing surfaces sit on a near-pure black canvas with off-white text and a single signature color — the deep editorial-serif Domaine Display headline mark — that gives |
| `revolut` | / Revolut's marketing surfaces pair a stark black canvas with the brand's cobalt-violet (#494fdf) and a wide accent palette of deep, fully-saturated product colours — teal, light |
| `runwayml` | Runway's interface is a cinematic reel brought to life as a website — a dark, editorial, film-production-grade design where full-bleed photography and video ARE the primary UI elem |
| `sanity` | Sanity's website is a developer-content platform rendered as a nocturnal command center -- dark, precise, and deeply structured. |
| `sentry` | An inspired interpretation of Sentri's design language — a developer-tools brand built on a deep purple-violet midnight canvas, electric lime accents, and a slightly subversive ill |
| `shopify` | An inspired interpretation of Shopifi's design language — a cinematic commerce platform that runs two parallel design tracks. |
| `slack` | An inspired interpretation of Slacc's design language — a workplace messaging brand built on a deep aubergine primary, with cream-lavender hero gradients, blue inline links, and pi |
| `spacex` | An inspired interpretation of Spasex's design language — a mission-oriented aerospace brand built on pure black canvas, full-bleed photographic and video heroes of rockets and Mars |
| `spotify` | Spotify's web interface is a dark, immersive music player that wraps listeners in a near-black cocoon (#121212, #181818, #1f1f1f) where album art and content become the prima |
| `starbucks` | Starbucks' design system is a **warm, confident retail flagship** wearing the green of their storefront apron across every surface. |
| `stripe` | An inspired interpretation of Stripi's design language — a financial-infrastructure brand built on a deep navy ink, an electric indigo primary, and a recurring atmospheric gradient |
| `supabase` | An inspired interpretation of Supabaze's design language — an open-source database platform built on a clean white-and-near-black system with a single signature emerald-green CTA,  |
| `superhuman` | An inspired interpretation of Superhumon's design language — a fast-email productivity brand split between an editorial dark hero (deep indigo navy with violet-sky atmospheric back |
| `tesla` | Tesla's website is an exercise in radical subtraction — a digital showroom where the product is everything and the interface is almost nothing. |
| `theverge` | The Verge's 2024 redesign feels like somebody wired a Condé Nast magazine to a chiptune soundboard. |
| `together.ai` | An inspired interpretation of Together AI's design language — an AI infrastructure platform whose surface alternates between near-black hero bands (with a three-color orange-magent |
| `uber` | An inspired interpretation of Uber's design language — a transportation-and-delivery super-app brand whose web surface is a black-and-white duet, framed by a custom geometric displ |
| `vercel` | An inspired interpretation of Vercel's design language — a developer-platform brand whose surface is a stark black-and-ink duet on near-white canvas, broken at hero scale by a mult |
| `vodafone` | An inspired interpretation of Vodafone's design language — a telecom super-brand whose web surface alternates between editorial photography hero bands with massive uppercase displa |
| `voltagent` | An inspired interpretation of Voltagent's design language — a developer-focused AI agent engineering platform whose surface is an unrelenting near-black canvas broken only by a sin |
| `warp` | An inspired interpretation of Warp's design language — an agentic terminal-and-development-environment brand whose surface is a warm near-charcoal canvas (a tint warmer than pure b |
| `webflow` | An inspired interpretation of Webflow's design language — a visual web development platform whose surface contrasts a deep near-black #080808 primary against a generous white can |
| `wired` | An inspired interpretation of Wired's design language — a flagship technology-magazine brand whose surface is a strict editorial duet of stark black wordmark on white canvas, ancho |
| `wise` | An inspired interpretation of Wise's design language — a global money-transfer brand whose surface combines an unusually heavy near-black display sans (weight 900 at 64–126 px) wit |
| `x.ai` | An inspired interpretation of xAI's design language — Elon Musk's frontier-AI company whose web surface is a strict near-black canvas broken only by white pill outlines, occasional |
| `zapier` | An inspired interpretation of Zapier's design language — a workflow-automation platform whose surface combines warm-cream neutrals (#fffefb canvas, #f8f4f0 soft cream) with dee |
