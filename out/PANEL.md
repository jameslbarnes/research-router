# Who should Elaine Shi share a stage with?

**Anchor:** Elaine Shi (Carnegie Mellon University) — cryptography, oblivious RAM, MPC, searchable encryption, BFT consensus, blockchain mechanism design

**Objective:** Interdisciplinary collaborators Elaine would benefit from MEETING — maximize productive topic-distance and cross-field reach, discounted by an already-met prior (discovery, not confirmation).

A prototype that walks the real coauthorship graph two hops out, scores by *productive distance* + cross-field reach, then discounts by an **already-met prior** — because the goal is *discovery*, and an introduction to someone the anchor has already met adds nothing.

**How this list is ordered:** by the critical-reviewer panel's discovery score (novelty discounted by likelihood they've already met), with ties broken by novelty, then met %, then name. The deterministic engine score that generated the pool is shown alongside; where the two disagree, both are visible.

## The discovery shortlist (ranked by critical review)

| # | Researcher | Affiliation | Discovery /10 | Novelty /10 | Met % | Engine disc. | Bridge |
|--:|---|---|--:|--:|--:|--:|---|
| 1 | **[Junbin Fang](dossiers/01-junbin-fang.md)** | Professor, Department of Optoelectronic Engineering, Jinan University (Guangzhou, China) | **5** | 6 | 7% | 0.1532 | classical BFT consensus & MPC ↔ experimental quantum cryptography and photonics |
| 2 | **[Nicolas Papernot](dossiers/02-nicolas-papernot.md)** | University of Toronto (Associate Professor, Electrical & Computer Engineering) and Vector Institute; Canada CIFAR AI Chair; part-time at Google | **3.5** | 7 | 40% | 0.1056 | cryptography & oblivious computation ↔ machine learning security and privacy |
| 3 | **[Pierre-Yves Strub](dossiers/03-pierre-yves-strub.md)** | PQShield (Lead Formal Verification Researcher); formerly École Polytechnique, Meta, IMDEA, INRIA | **3.5** | 7 | 40% | 0.0793 | oblivious algorithms & relational privacy definitions ↔ machine-checked proofs and verified compilation |
| 4 | **[Deepak Garg](dossiers/04-deepak-garg.md)** | Max Planck Institute for Software Systems (MPI-SWS), Saarbrücken; also Professor at Saarland University | **3.5** | 7 | 60% | 0.1334 | ORAM & MPC theory ↔ programming languages, verification, and TEE systems |
| 5 | **[Santiago Zanella-Béguelin](dossiers/05-santiago-zanella-beguelin.md)** | Microsoft Research Cambridge (UK), Principal Researcher, Azure Research / Confidential AI | **3.5** | 6 | 35% | 0.0706 | ORAM & differential obliviousness ↔ confidential AI systems and LLM privacy |
| 6 | **[Ruoxi Jia](dossiers/06-ruoxi-jia.md)** | Virginia Tech, Bradley Department of Electrical and Computer Engineering (Assistant Professor; courtesy appointment in CS, Sanghani Center for AI) | **3.5** | 6 | 40% | 0.0319 | blockchain mechanism design & MPC ↔ data valuation and the data economy |
| 7 | **[Zhan Qin](dossiers/07-zhan-qin.md)** | Zhejiang University (College of Computer Science and Technology) | **3** | 5 | 30% | 0.1283 | differential obliviousness & shuffle-model privacy ↔ deployed LDP systems and AI security |

Shi's network is so dense that half the original sixteen collapsed on inspection: department colleagues, Perrig academic siblings, former co-panelists, people she co-chaired workshops with. What survives sorts into three directions her current collaborators do not cover. Three candidates bring machine-checked proof and verified-systems machinery (Strub, Garg, Zanella-Béguelin), three bring the ML security and data-economy world where she has near-zero citation contact (Papernot, Jia, Qin), and one outlier, Junbin Fang, runs photonic quantum Byzantine agreement experiments that collide with her classical consensus bounds from a lab nobody in her orbit can reach. No one scored above 5 on discovery; read this roster as productive adjacencies plus one real long shot, not as surprises.

## Engine met-prior vs. the panel (a consistency check, not a validation)

Both columns are heuristics: the engine prior is graph structure plus a hand-curated per-anchor circle file, and the panel percentages are a reviewer agent's web-researched estimates. The circle file was seeded from what the panel surfaced, so agreement at the high end is partly by construction. Agreement threshold: 20 points.

| Researcher | engine met-prior | panel met % | within threshold? |
|---|--:|--:|:--:|
| Junbin Fang | 25% | 7% | ✓ |
| Nicolas Papernot | 55% | 40% | ✓ |
| Pierre-Yves Strub | 53% | 40% | ✓ |
| Deepak Garg | 23% | 60% | ✗ |
| Santiago Zanella-Béguelin | 54% | 35% | ✓ |
| Ruoxi Jia | 85% | 40% | ✗ |
| Zhan Qin | 51% | 30% | ✗ |

## Method, honestly

- **Source:** OpenAlex (live, key-less) for the graph; a critical-reviewer agent panel (web research) for the already-met judgement.
- **Walk:** 314 direct coauthors (excluded; 314 walked) → 49613 coauthors-of-coauthors → 294 best-bridged → 137 cleared the shared-thread gate → 7 vetted finalists.
- **Engine score (pool generation):** `overlap·(1−overlap) · (0.5+reach) · (1 − already_met_prior)`. Citations enter only the novelty rerank, never the met prior's genealogy/community core. Citation counts are distinct citing papers on deduped works; zeros are lower bounds under partial reference coverage.
- **Roster order (publication):** the critical panel's discovery score with the documented tie-break — not the engine formula. The engine generates; the panel and curation vet and order.
- **Vetting:** merge-errors and redundant/low-reach picks dropped by reading abstracts; the panel web-checked every pairing for prior acquaintance.

**Dropped, and why:**
- *Laurent Chuat* — Vetting drop: real person, but the engine score rests on artifacts. His 53 'joint works' with Perrig are inflated by two SCION book editions counted chapter by chapter, the 'Zurich Insurance Group' affiliation is an OpenAlex mapping error for ETH Zurich, and he left research around 2022 for a security-architect role at Kyos SA in Geneva with no publications since. His applied web-PKI and network-security profile is peripheral to Shi's core.
- *Paweł Szałachowski* — Panel demotion (discovery 2.5, met ~45%): he sits inside Shi's first-degree graph. Four years and 40 papers in the group of her PhD advisor Adrian Perrig, now working with her longtime IC3 collaborator Ari Juels at Chainlink Labs on fair sequencing and MEV. He cites her in 29 papers and she cites him in none, so an introduction routes within her existing network rather than discovering anything.
- *K. P. Chow* — Panel demotion (discovery 2.5, met ~15%): his court-facing digital-forensics world is genuinely outside Shi's orbit, but his cryptography is applied 2000s-era work, and he shares an HKU department with T-H. Hubert Chan, one of her most frequent co-authors, plus Siu-Ming Yiu. She can reach him with one email whenever she wants a forensics partner; the arranged hour would be pleasant but low yield.
- *Andreas Haeberlen* — Panel demotion (discovery 2, met ~70%): confirmed co-service on the CCSW 2013 program committee, his group cites her in 13 papers, and both have circulated through the same Oakland/CCS/PETS orbit for 15+ years. The DP-systems-meets-obliviousness complementarity is real, but it is an obvious adjacent collaboration between people who likely already know each other, not something a router unlocks.
- *Yongdong Wu* — Panel demotion (discovery 2, met ~12%): senior applied multimedia-security researcher whose blockchain sharding, PBFT, and FL-privacy work sits downstream of the literature Shi helped create. Citation flow is strictly one way (he cites her in 5 papers, she cites him in 0), and his distinctive strengths (watermarking, chaos-based encryption) offer her no joint artifact. The meeting would be him drawing on her.
- *Tiffany Hyun‐Jin Kim* — Panel demotion (discovery 1.5, met ~78%): academic sibling. Both are Adrian Perrig PhD students from CMU CyLab (Shi 2008, Kim 2012), with probable physical overlap in the same group. Her usable-security and applied MPC/IoT work at HRL offers modest complementarity, but the Perrig route makes the introduction worthless as routing.
- *Steven Myers* — Panel demotion (discovery 1.5, met ~60%): one hop from Shi's innermost circle, with 4 joint works with Rafael Pass and 10 with Abhi Shelat including ANONIZE at S&P 2014. He left Indiana University for Apple and has not published since about 2020, so a joint academic artifact is improbable. Residual value is an Apple deployment contact, which is networking, not discovery.
- *Aikaterini Mitrokotsa* — Panel demotion (discovery 1.5, met ~80%): confirmed direct professional interaction. Shi was Program Co-Chair of AISec 2013 while Mitrokotsa served on that same PC, and Mitrokotsa co-chaired AISec 2014 as the direct successor, alongside Shi's own 2013 co-chairs Dimitrakakis and Nelson, who are Mitrokotsa's closest collaborators. Her secure-aggregation agenda also sits inside Shi's home field rather than across from it.
- *David P. Woodruff* — Panel demotion (discovery 1, met ~96%): he is Shi's own CMU colleague, in the same department for roughly five years, with mutual citations and shared co-authors (van Dijk, Kuszmaul, Goldwasser). The sketching-meets-obliviousness bridge is genuinely interesting, but she can walk down the hall; an engineered introduction adds nothing.
