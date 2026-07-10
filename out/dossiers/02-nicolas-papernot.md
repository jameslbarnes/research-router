# Nicolas Papernot
*University of Toronto (Associate Professor, Electrical & Computer Engineering) and Vector Institute; Canada CIFAR AI Chair; part-time at Google* — Leading researcher at the intersection of machine learning security and privacy: adversarial examples, differentially private learning (PATE), and machine unlearning.

📄 **[Paper-level discussion draft → ../syntheses/shi-x-nicolas-papernot.md](../syntheses/shi-x-nicolas-papernot.md)**

**Bridge type:** cryptography & oblivious computation ↔ machine learning security and privacy  
**Citation tier:** 🧊 cold — no citation either way (distinct papers: they cite her ×0, she cites them ×0) (their ref coverage 47%; zeros are lower bounds)  
**Path to Elaine Shi:** two hops, via Xiao Wang (3 joint papers), Florian Tramèr (15 joint papers), Abhradeep Thakurta (11 joint papers), Nicholas Carlini (16 joint papers)  
**Productive-distance signal:** overlap 0.273 · reach 0.681 · bridge-score 0.2342 · engine discovery 0.1056

## ⚖️ Critical assessment
**Discovery 3.5/10** · novelty 7/10 · met-likelihood 40% (engine prior 0.549) · reviewer confidence medium

> Intellectually promising pairing — verifiable machine unlearning, differentially oblivious ML training, or MPC-hardened PATE are concrete two-way artifacts, and ML security is genuinely new territory for Shi (zero mutual citations). But discovery value is low: both are celebrity-tier fixtures of the same S&P/CCS/USENIX circuit with multiple strong mutual collaborators (Tramèr, Carlini, Xiao Wang), so Shi could reach him with one email, and there is a moderate chance they already know each other socially.

**Already met?** No acquaintance evidence found: checked co-authorship and cross-citations (zero both ways per engine), shared PCs at IEEE S&P 2019-22/CCS/SaTML (none confirmed; Shi absent from SaTML PCs despite Papernot co-chairing 2023-24), joint workshops/panels/Simons/Dagstuhl (none; Shi's Simons stint was the Fall 2019 blockchain program), and institutional overlap (Penn State→Google Brain→Toronto never intersects CMU/Berkeley/PARC/UMD/Cornell/CMU). Indirect proximity is high: mutual collaborators include Florian Tramèr (15 joint works with Papernot; also co-authored Sealed-Glass Proofs with Shi, EuroS&P 2017) and Xiao Wang (3 joint with Shi), and both attend the same top-4 security venues.

**Why the score:** Novelty is real (7/10): Shi has no ML-security work and Papernot has no formal crypto tooling, so joint artifacts like SNARK/MPC-based proofs-of-unlearning, differentially oblivious DP-SGD (access-pattern-protected training), or securely aggregated PATE are concrete and publishable at S&P/SaTML. But discovery discounts are heavy: ~40% chance of prior substantive acquaintance, trivially reachable through at least three strong mutual collaborators, same conference circuit, and the crypto-for-ML niche is already populated (including by Shi's own collaborator Xiao Wang). Net discovery ~3.5/10 — a fine introduction, not a find.

**Critical caveats:** Met-likelihood estimate is uncertain in both directions: absence of PC/workshop evidence is weak (full PC rosters for S&P/CCS years were not exhaustively enumerable via search), and two researchers this prominent in one community may well have met informally without any web trace; conversely the zero cross-citation signal over 240+ works suggests no intellectual engagement. Bridge counts in data.json were taken at face value (joint-work semantics not independently verified except Tramèr-Shi). Novelty assumes Shi wants to move toward ML — her agenda is currently theory/consensus-heavy and she may have no appetite for empirical ML security.

## Shared substrate
Both build privacy notions with formal guarantees under differential privacy's umbrella: his PATE and DP-SGD line descends from the same definitional root as her private stream aggregation (NDSS 2011) and differential obliviousness. They share strong collaborators, including Florian Tramèr (15 joint works with Papernot, and a co-author on Shi's Sealed-Glass Proofs) and Xiao Wang, yet the two of them have zero cross-citations across roughly 500 combined papers.

## Productive divergence
He owns the empirical ML attack surface she has never touched: membership inference, adversarial robustness, and unlearning, where the field currently has no verifiable guarantees. Her tools are the missing half. SNARK or MPC-based proofs of unlearning, access-pattern-protected DP-SGD, and PATE with the trusted aggregator replaced by secure computation are all concrete papers that need one person from each side.

## Seed questions for the conversation
- Machine unlearning has no verifiable guarantees today. If you wanted a SNARK or MPC-based proof of unlearning, what is the statement you would actually want proven?
- DP-SGD protects gradients but the training loop still leaks memory access patterns. Is that side channel above or below the threat models you care about, and would a differentially oblivious training loop close a real attack?
- PATE routes teacher votes through a trusted aggregator. What breaks, in accuracy or in the privacy analysis, if that aggregation runs inside MPC?
- You and Shi have never cited each other despite adjacent agendas. From your side, where does the crypto-for-ML literature miss what ML security actually needs?

## Evidence — their most-cited work

- (2016, 3925 cites) **The Limitations of Deep Learning in Adversarial Settings**
- (2017, 3488 cites) **Practical Black-Box Attacks against Machine Learning**
- (2017, 1867 cites) **Ensemble Adversarial Training: Attacks and Defenses** — *arXiv (Cornell University)*
- (2016, 1420 cites) **Transferability in Machine Learning: from Phenomena to Black-Box Attacks using Adversarial Samples** — *arXiv (Cornell University)*
- (2017, 1109 cites) **Ensemble Adversarial Training: Attacks and Defenses** — *arXiv (Cornell University)*
- (2019, 604 cites) **MixMatch: A Holistic Approach to Semi-Supervised Learning** — *arXiv (Cornell University)*
