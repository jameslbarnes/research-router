# Junbin Fang
*Professor, Department of Optoelectronic Engineering, Jinan University (Guangzhou, China)* — Professor of Optoelectronic Engineering at Jinan University working across applied cryptography (private set operations, FSS/TFHE-based secure inference), quantum key distribution and quantum Byzantine agreement, visible-light communication, and digital forensics, with a long-running HKU collaboration (Siu-Ming Yiu, Lucas Hui).

📄 **[Paper-level discussion draft → ../syntheses/shi-x-junbin-fang.md](../syntheses/shi-x-junbin-fang.md)**

**Bridge type:** classical BFT consensus & MPC ↔ experimental quantum cryptography and photonics  
**Citation tier:** ➡️ one-way inbound — they cite the anchor, she doesn't track them (distinct papers: they cite her ×2, she cites them ×0) (their ref coverage 86%; zeros are lower bounds)  
**Path to Elaine Shi:** two hops, via Kui Ren (1 joint papers), Siu‐Ming Yiu (34 joint papers), Lucas C. K. Hui (16 joint papers)  
**Productive-distance signal:** overlap 0.611 · reach 0.356 · bridge-score 0.2034 · engine discovery 0.1532

## ⚖️ Critical assessment
**Discovery 5/10** · novelty 6/10 · met-likelihood 7% (engine prior 0.247) · reviewer confidence medium

> A plausible long-shot discovery rather than a waste: they almost certainly have not met, and Fang's experimental quantum Byzantine agreement / QKD line (photonic QBA beating the classical 1/3 fault-tolerance bound) collides directly with Shi's classical consensus lower-bound and blockchain agenda in a way her own network cannot supply. The concrete joint artifact would be a paper pinning down what quantum resources actually buy against Shi-style full-information adversaries, or a rigorous security analysis of his lab's QBA protocols. Discounts: his mainstream crypto output (PSO, FSS/TFHE inference, forensics) is solid but not frontier relative to Shi's collaborators, and the payoff depends entirely on whether she wants to engage quantum consensus at all.

**Already met?** No acquaintance evidence found: checked DBLP (no co-authorship; Lucas Hui's page confirms no Shi joint work), program committees (Fang absent from S&P/CCS/Crypto/Eurocrypt PCs), institutional history (Guangzhou/Jinan + HKU forensics collaboration vs Shi's CMU/Berkeley/PARC/UMD/Cornell path — zero overlap), and bridge collaborators (Yiu, Hui, Kui Ren — none close to Shi). Only weak co-location signal: Fang co-authored an accepted paper at IEEE S&P 2026 where CMU/CyLab also presented, so a hallway encounter in May 2026 is possible but unevidenced. Citation flow is one-way (he cites her in 2 papers, she cites him in 0), consistent with awareness without contact.

**Why the score:** Novelty 6: his strongest non-crypto line — experimental photonic quantum Byzantine agreement and QKD — is genuinely orthogonal to Shi's network and maps onto her BFT/consensus expertise with a concrete two-way artifact (theory-grounded analysis or lower bounds for quantum BA; she supplies adversary models and bounds, he supplies a photonics lab and protocols). His applied-crypto work (private set operations at S&P 2026, FSS/TFHE inference) overlaps her area but adds little she can't get closer to home, and his forensics/VLC lines are irrelevant to her. Discovery 5: met-likelihood is low (~7%) so little discount there, and she could NOT trivially reach him — different country, different community, no shared close collaborators (bridge_score 0.20) — but the score is capped by uncertainty over whether quantum consensus is a direction she values and by the small scale (3-user demos) of current QBA experiments.

**Critical caveats:** Evidence is thin in places: I could not verify Fang's exact author role on the flagship QBA experiments (large multi-group physics author lists; his contribution may be peripheral), nor exhaustively check Chinese-language venues or Asiacrypt/Inscrypt PC rosters for overlap. The May 2026 S&P co-location slightly raises met probability but attendance by Fang himself (vs his HIT-Shenzhen co-authors) is unconfirmed. One search summary falsely suggested a Fang-Hui-Shi joint paper; direct DBLP inspection refuted it — treat aggregator claims about this pairing with suspicion. If Shi has no appetite for quantum-flavored consensus, realistic value drops to ~3.

## Shared substrate
The overlap is real applied cryptography: his private set operations paper accepted to IEEE S&P 2026 and his FSS/TFHE secure neural-network inference sit in the same MPC territory as her ObliVM and secure-computation line, and his group cites her in two papers. OpenAlex puts his top topics at Cryptography and Data Security plus Privacy-Preserving Technologies, the same pair that dominates her own profile.

## Productive divergence
He has what none of her collaborators have: a photonics lab running quantum Byzantine agreement experiments that claim to beat the classical one-third fault-tolerance bound, plus QKD deployment experience. Shi wrote Hybrid Consensus, Thunderella, Snow White, and FruitChains; she knows exactly which classical adversary models those quantum claims must survive. A joint paper pinning down what quantum resources actually buy against full-information adversaries would need both of them and could not be written inside either of their existing networks.

## Seed questions for the conversation
- Your photonic quantum Byzantine agreement demos report fault tolerance beyond the classical one-third bound. What adversary model do they actually assume, and would the claim survive the full-information adversaries used in classical BA lower bounds?
- What breaks first when the three-party QBA experiments scale toward the n-party regimes that protocols like Thunderella or Snow White assume: the photonics, the protocol, or the security proof?
- Could a composable security proof be retrofitted onto your lab's QBA protocols, or do they need redesign from the definitions up?
- In your S&P 2026 private set operations work, where do the concrete costs sit relative to generic circuit-based MPC, and is there room for oblivious-algorithm techniques to cut them?

## Evidence — their most-cited work

- (2017, 195 cites) **An Efficient Flicker-Free FEC Coding Scheme for Dimmable Visible Light Communication Based on Polar Codes** — *IEEE photonics journal*
- (2017, 92 cites) **High-Speed Indoor Navigation System based on Visible Light and Mobile Phone** — *IEEE photonics journal*
- (2013, 90 cites) **A New Payment System for Enhancing Location Privacy of Electric Vehicles** — *IEEE Transactions on Vehicular Technology*
- (2024, 79 cites) **AI-Based Advanced Approaches and Dry Eye Disease Detection Based on Multi-Source Evidence: Cases, Applications, Issues, and Future Directions** — *Big Data Mining and Analytics*
- (2019, 78 cites) **Quartz-enhanced photoacoustic spectroscopy employing pilot line manufactured custom tuning forks** — *Photoacoustics*
- (2018, 71 cites) **High performance all-fiber temperature sensor based on coreless side-polished fiber wrapped with polydimethylsiloxane** — *Optics Express*
