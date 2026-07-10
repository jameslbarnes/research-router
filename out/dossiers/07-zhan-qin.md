# Zhan Qin
*Zhejiang University (College of Computer Science and Technology)* — ZJU100 Young Professor at Zhejiang University (PhD SUNY Buffalo under Kui Ren, formerly UT San Antonio) working on local differential privacy, secure computation outsourcing, encrypted cloud data, and adversarial-ML security. (Note: the 'Hubei University of Technology' affiliation in raw OpenAlex data is a same-name merge error.)

**Bridge type:** differential obliviousness & shuffle-model privacy ↔ deployed LDP systems and AI security  
**Citation tier:** 🔁 mutual (anti-signal) (distinct papers: they cite her ×9, she cites them ×1) (their ref coverage 71%; zeros are lower bounds)  
**Path to Elaine Shi:** two hops, via Tianhao Wang (2 joint papers), Kui Ren (65 joint papers)  
**Productive-distance signal:** overlap 0.465 · reach 0.557 · bridge-score 0.263 · engine discovery 0.1283

## ⚖️ Critical assessment
**Discovery 3/10** · novelty 5/10 · met-likelihood 30% (engine prior 0.512) · reviewer confidence medium

> Plausibly-new but low-payoff introduction. Qin's LDP heavy-hitter/poisoning work has a genuine technical seam with Shi's differential obliviousness and shuffle-model interests, but his current center of gravity is AI/adversarial-ML security and watermarking, well outside her agenda, and he is one trivial hop away via his advisor Kui Ren (65 joint works) and the shared CCS circuit. This looks more like an ordinary community contact than a discovery.

**Already met?** No acquaintance evidence found: checked direct name co-occurrence, Shi's publication list, joint workshops/panels, PC listings (partially retrievable), institutional genealogy (Qin: Buffalo PhD 2017 under Kui Ren, UTSA, ZJU since ~2019 vs Shi: CMU/Berkeley/PARC/UMD/Cornell/CMU — zero overlap), and IC3/Simons involvement (none found for Qin). They do share the CCS/S&P publication circuit (his CCS 2016 LDP paper era coincides with her heavy CCS presence), and citations are one-way foundational (9 from his group to her, 1 back), so a hallway meeting is possible but a substantive one is unlikely; his 2019 move to China plus the COVID years further reduce co-presence.

**Why the score:** Novelty 5: the one real seam is his LDP-for-streams/set-valued-data and LDP-poisoning work vs her differential obliviousness — a joint artifact (differentially oblivious or shuffle-model analytics robust to LDP poisoning) is concretely imaginable and two-way. But his encrypted-cloud-outsourcing line is the class of practical scheme her community routinely breaks, and his dominant current output (model watermarking, adversarial ML, malware detection) does not feed her agenda. Discovery 3 after discounting: ~30% met likelihood, and near-zero reach cost — she could get to him instantly through Kui Ren or any CCS PC cycle, so the introduction adds little beyond what her existing network already provides.

**Critical caveats:** Qin's PC service records could not be fully retrieved; if he has served on CCS/S&P PCs alongside Shi (plausible for a ZJU100 professor in this area), met likelihood should rise to 45-55% and discovery drop further. data.json lists his affiliation as Hubei University of Technology, which is wrong (he is at Zhejiang University), suggesting other engine signals for this candidate may be noisy. The 9-citations-to-her signal was not paper-by-paper verified. Assessment of his current research emphasis rests on arXiv/S&P 2024 output sampled via search, not an exhaustive bibliography.

## Shared substrate
His LDP work on heavy hitters, set-valued data, and streams descends directly from the line she started with Private and Continual Release of Statistics (2011) and private stream aggregation; his group cites her in nine papers. Both publish in the CCS orbit, and his encrypted-cloud-outsourcing work runs parallel to her searchable encryption results.

## Productive divergence
He works where LDP meets deployment and adversaries: his poisoning attacks show that LDP aggregators cannot authenticate client randomization, a failure mode central-model theory never had to face. The productive seam is shuffle-model or differentially oblivious analytics that stay robust under LDP poisoning, her definitions against his attacks. His adversarial-ML and watermarking work is further from her agenda but keeps him fluent in the AI-security venues she does not read.

## Seed questions for the conversation
- Your LDP poisoning attacks exploit the aggregator's inability to authenticate randomization. Does the shuffle model make that better or worse, and could verifiable randomization inside MPC close it?
- For LDP over streams, how much utility do you lose against the central continual-release model, and would a differentially oblivious aggregator buy any of it back?
- After the leakage-abuse literature, which encrypted-outsourcing constructions from your line still stand, and what leakage profile do you now consider defensible?
- What is the largest LDP deployment you have seen inside industry, and what broke first at that scale?

## Evidence — recent work (citation counts pending API budget reset)

- (2026) **A Survey on Medical Large Language Models: Technology, Application, Trustworthiness, and Future Directions**
- (2026) **FIT-Print: Toward False-Claim-Resistant Model Ownership Verification via Targeted Fingerprint**
- (2026) **DREAM: Scalable Red Teaming for Text-to-Image Generative Systems via Distribution Modeling**
- (2026) **Reading Between the Lines: Towards Reliable Black-box LLM Fingerprinting via Zeroth-order Gradient Estimation**
- (2026) **External Data Extraction Attacks Against Retrieval-Augmented Large Language Models**
- (2026) **DUALBREACH: Efficient Dual-Jailbreaking via Target-Driven Initialization and Multi-Target Optimization**
