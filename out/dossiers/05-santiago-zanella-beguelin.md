# Santiago Zanella-Béguelin
*Microsoft Research Cambridge (UK), Principal Researcher, Azure Research / Confidential AI* — Principal Researcher on MSR's Confidential AI team who moved from machine-checked crypto proofs (EasyCrypt) and verified implementations (Project Everest, TLS 1.3, HACL*) into LLM privacy attacks and confidential inference on attested GPUs.

**Bridge type:** ORAM & differential obliviousness ↔ confidential AI systems and LLM privacy  
**Citation tier:** 🔁 mutual (anti-signal) (distinct papers: they cite her ×4, she cites them ×2) (their ref coverage 67%; zeros are lower bounds)  
**Path to Elaine Shi:** two hops, via Bryan Parno (4 joint papers), Florian Tramèr (2 joint papers), Benjamin Grégoire (20 joint papers), Gilles Barthe (28 joint papers)  
**Productive-distance signal:** overlap 0.56 · reach 0.127 · bridge-score 0.1545 · engine discovery 0.0706

## ⚖️ Critical assessment
**Discovery 3.5/10** · novelty 6/10 · met-likelihood 35% (engine prior 0.543) · reviewer confidence medium

> A real but reachable-anyway pairing: his MSR Confidential AI work (attested TEE-based LLM inference, LLM/agent privacy attacks) has an access-pattern side-channel gap that Shi's ORAM/differential-obliviousness expertise directly fills, so a concrete joint artifact exists. However, Bryan Parno — his 4x Everest co-author — is Shi's CMU colleague and academic sibling under Perrig, so she is one warm email away from him already, and there is a fair chance they have at least crossed paths at CCS. Useful introduction, not a discovery.

**Already met?** No acquaintance evidence found: checked DBLP (no co-authorship), CCS 2021 PC list (he is NOT on the PC Shi co-chaired, though he authored a CCS 2021 paper — chair/author implies no personal contact), his IMDEA and MSR pages (no PC/workshop service listed, no Shi/CMU/IC3/Simons mention), and career geography (INRIA Sophia -> IMDEA Madrid -> MSR Cambridge UK vs. her all-US path; zero co-location). Overlap is limited to both publishing at CCS since 2013 and mutual citations (she cites him in 2 papers, he cites her in 4), which indicates awareness only. Strong indirect tie: Bryan Parno (CMU, Perrig student like Shi) has 4 joint works with him via Project Everest.

**Why the score:** Novelty 6: his non-crypto line (LLM membership-inference/leakage, agent security, confidential AI on attested GPUs) is genuinely outside Shi's portfolio, and the two-way artifact is concrete — a differentially-oblivious or ORAM-backed confidential LLM inference design (her theory, his production TEE stack), or EasyCrypt machine-checked ORAM proofs. Discounts: (1) met likelihood ~35% from 15 years of shared CCS/S&P orbit despite no hard evidence; (2) heavy trivial-reachability discount — Shi can reach him in one hop via Bryan Parno at CMU, and she already knows the TEE/secure-processor space (PHANTOM, GhostRider), so the intro adds routing convenience more than new territory. Bridge_score 0.1545 is low, consistent with adjacent-but-distinct communities. Net discovery 3.5.

**Critical caveats:** PC overlap checks were not exhaustive: I verified only the CCS 2021 PC page directly; he may have served on CCS 2022-2024 or IEEE S&P PCs alongside Shi (hotcrp PC lists were not fully accessible), which would raise met likelihood. His MSR/IMDEA pages list no professional service, so his PC record is under-documented. The 0.543 deterministic met-prior may be inflated by venue co-occurrence; my 35% assumes 'substantively met' requires more than hallway proximity. Citation contexts (which of his 4 papers cite her, and vice versa) were not individually inspected.

## Shared substrate
She built the oblivious-hardware canon (PHANTOM, GhostRider, ObliviStore); he now runs production confidential computing for LLM inference on attested GPUs. They have cited each other a handful of times (he cites her in 4 papers, she cites him in 2) and have both published at CCS since 2013. Bryan Parno, his co-author on four Everest works, is her CMU colleague and fellow Perrig student.

## Productive divergence
He knows two things she does not: what a production TEE stack for LLM inference actually looks like, and how LLMs leak (membership inference, agent security, extraction attacks). The open seam is that attested GPU inference still leaks access patterns, and her ORAM and differential obliviousness theory is the layer that could close it, if the costs can be made tolerable at LLM scale.

## Seed questions for the conversation
- In Azure's confidential LLM inference, what does the access-pattern side channel actually look like on attested GPUs, and what overhead would production tolerate for an ORAM or differentially oblivious layer?
- Do your membership-inference or extraction attacks get measurably stronger when the adversary sees access patterns? Is there a demonstrated attack that obliviousness would close?
- KV-cache management and mixture-of-experts routing both leak input-dependent structure. Has your team measured that channel?
- Would MSR treat a machine-checked ORAM proof as an Everest-style artifact worth building, and who inside the company would consume it?

## Evidence — recent work (citation counts pending API budget reset)

- (2026) **Optimizing Agent Planning for Security and Autonomy**
- (2026) **Optimizing Agent Planning for Security and Autonomy**
- (2026) **Project Everest: Perspectives from Developing Industrial-Grade High-Assurance Software**
- (2025) **The Price of Intelligence**
- (2025) **Securing AI Agents with Information-Flow Control**
- (2025) **A Representation Engineering Perspective on the Effectiveness of Multi-Turn Jailbreaks**
