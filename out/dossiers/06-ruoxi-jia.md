# Ruoxi Jia
*Virginia Tech, Bradley Department of Electrical and Computer Engineering (Assistant Professor; courtesy appointment in CS, Sanghani Center for AI)* — Assistant Professor at Virginia Tech (PhD UC Berkeley 2018, postdoc with Dawn Song) known for data valuation (Data Shapley), differential privacy in ML, adversarial robustness, and LLM safety.

**Bridge type:** blockchain mechanism design & MPC ↔ data valuation and the data economy  
**Citation tier:** 🧊 cold — no citation either way (distinct papers: they cite her ×0, she cites them ×0) (their ref coverage 44%; zeros are lower bounds)  
**Path to Elaine Shi:** two hops, via Dawn Song (19 joint papers), Dawn Song (5 joint papers), Arvind Narayanan (2 joint papers), Dawn Song (8 joint papers), Tianhao Wang (7 joint papers), Neil Zhenqiang Gong (2 joint papers), Z. Morley Mao (3 joint papers)  
**Productive-distance signal:** overlap 0.23 · reach 0.686 · bridge-score 0.2098 · engine discovery 0.0319

## ⚖️ Critical assessment
**Discovery 3.5/10** · novelty 6/10 · met-likelihood 40% (engine prior 0.848) · reviewer confidence medium

> Real but discounted opportunity: Jia's data-valuation/data-market agenda genuinely complements Shi's mechanism design and MPC work (a concrete joint artifact would be an incentive-compatible, privacy-preserving data marketplace pairing Data Shapley pricing with Shi's cryptographic and fee-mechanism machinery). However, both are core members of Dawn Song's inner circle — Shi her former postdoc and heavy co-author, Jia her recent postdoc — so the intro is nearly free for Shi to make herself, and there is a moderate chance they have already crossed paths through Song's orbit. Worth an hour, but it is a facilitated shortcut, not a discovery.

**Already met?** No direct acquaintance evidence found: checked co-authorship/citations (zero both ways), joint web co-occurrence of names (none substantive), CCS/S&P/USENIX PC rosters (Jia serves ML venues only: NeurIPS/ICML/KDD/ICLR/AAAI), Simons Institute programs (Jia spoke at Data Privacy workshop Mar 2019; Shi was in Cryptography Summer 2015 and Proofs/Consensus Fall 2019 — no program overlap), Berkeley residency (Shi left ~2012, Jia arrived 2013 — no overlap as members). Strongest proximity: both are Dawn Song protegees (Shi postdoc/co-author era ~2008-2014; Jia postdoc 2018-2020, 19 joint works), and Shi was a Simons visiting scientist at Berkeley in Fall 2019 while Jia was a postdoc in Song's group there — plausible but unevidenced contact window.

**Why the score:** Novelty 6: Jia's strongest non-crypto line (Data Shapley valuation, data-centric ML, LLM safety) maps cleanly onto Shi's blockchain mechanism design and MPC — a decentralized data market with principled valuation plus incentive-compatible, privacy-preserving settlement is a concrete two-way artifact, and Shi's differential obliviousness intersects Jia's DP-in-ML work. But the intersection is partially pre-charted within their shared circle (Dawn Song herself founded Oasis Labs on exactly the privacy-preserving data-market thesis), which caps the novelty. Discovery 3.5: discounted by ~40% met likelihood and, more heavily, by trivial reachability — Shi is one warm hop from Jia via Dawn Song and could get this meeting with a single email; the router adds little routing value here despite genuine topical complementarity (bridge_score 0.21 correctly reads them as topically distant on paper).

**Critical caveats:** Met-likelihood is a judgment call: the deterministic prior (0.848) is much higher than my estimate; I weighted the total absence of cross-citations across ~400 combined works and their disjoint venue/PC ecosystems as evidence against substantive contact, but Song-group socials, Berkeley security events, or Rising Stars-type gatherings could have produced an unrecorded meeting. I could not enumerate all PC rosters or workshop attendee lists (only speakers), so co-service at a venue I did not check remains possible. Jia's PhD advisor at Berkeley was Costas Spanos (CPS/buildings), not Song — her security-community embedding began mainly in the 2018-2020 postdoc, after Shi had left; if that genealogy detail is wrong the overlap window widens.

## Shared substrate
Both are Dawn Song protegees from different eras (Shi as postdoc and heavy co-author around 2008 to 2014, Jia as postdoc 2018 to 2020 with 19 joint works), yet they have zero cross-citations. The shared substrate is the privacy-preserving data market: Song founded Oasis Labs on that thesis, Jia supplies the pricing theory, and Shi's transaction fee mechanism and MPC work supplies the settlement layer such markets still lack.

## Productive divergence
She owns principled data pricing: Data Shapley and its successors answer what a data point is worth to a model, a question nobody in Shi's network works on. A data marketplace needs valuation that is private and strategyproof at once. Jia's valuation currently requires seeing the data and ignores seller manipulation; Shi's incentive-compatibility and secure-computation results are the missing constraints. Jia's DP-in-ML and LLM-safety lines give a second, smaller seam with differential obliviousness.

## Seed questions for the conversation
- Data Shapley needs access to the data it is valuing. Can valuation run under MPC or over committed data, and which approximations survive that constraint?
- Is data valuation strategyproof? A seller can replicate or perturb records to inflate value. Does that failure connect to the incentive problems Shi studies in transaction fee mechanisms?
- What would a decentralized data market need from its consensus and settlement layer that current chains do not provide?
- Where does DP fall short as the privacy currency in data markets, and would obliviousness on the query side change the accounting?

## Evidence — recent work (citation counts pending API budget reset)

- (2026) **Diagnosing and Repairing Citation Failures in Generative Engine Optimization**
- (2026) **Diagnosing and Repairing Citation Failures in Generative Engine Optimization**
- (2026) **MAViS: A Multi-Agent Framework for Long-Sequence Video Storytelling**
- (2025) **Safety at Scale: A Comprehensive Survey of Large Model and Agent Safety**
- (2025) **Detecting Adversarial Data Using Perturbation Forgery**
- (2025) **Safety at Scale: A Comprehensive Survey of Large Model Safety**
