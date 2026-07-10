# Pierre-Yves Strub
*PQShield (Lead Formal Verification Researcher); formerly École Polytechnique, Meta, IMDEA, INRIA* — Principal author of EasyCrypt and the Jasmin verified compiler, specializing in machine-checked cryptographic proofs and formally verified post-quantum implementations (Kyber, SPHINCS+).

📄 **[Paper-level discussion draft → ../syntheses/shi-x-pierre-yves-strub.md](../syntheses/shi-x-pierre-yves-strub.md)**

**Bridge type:** oblivious algorithms & relational privacy definitions ↔ machine-checked proofs and verified compilation  
**Citation tier:** 🔁 mutual (anti-signal) (distinct papers: they cite her ×7, she cites them ×2) (their ref coverage 72%; zeros are lower bounds)  
**Path to Elaine Shi:** two hops, via Jonathan Katz (1 joint papers), Xiong Fan (1 joint papers), Benjamin Grégoire (36 joint papers), Gilles Barthe (50 joint papers), Charlie Jacomme (1 joint papers)  
**Productive-distance signal:** overlap 0.389 · reach 0.213 · bridge-score 0.1695 · engine discovery 0.0793

## ⚖️ Critical assessment
**Discovery 3.5/10** · novelty 7/10 · met-likelihood 40% (engine prior 0.532) · reviewer confidence medium

> A genuinely good technical fit — Strub's probabilistic coupling logics (EasyCrypt/apRHL) are the right machinery to mechanize Shi's differential-obliviousness and ORAM proofs, and Jasmin could yield verified oblivious implementations — but it is a weak discovery. Shi is one hop away via her own PhD student Xiong Fan (co-author of EasyPQC with Strub and Katz) and via Jonathan Katz, so she could reach him trivially, and they have likely at least crossed paths at CCS/S&P over 15 years. Worth an introduction only if she actively wants machine-checked proofs; not a surprising connection.

**Already met?** No direct acquaintance evidence found: no co-authorship (dblp, Scholar, IACR cryptodb), no shared institution ever (his career is INRIA/IMDEA/Polytechnique/Meta/PQShield, all Europe; hers is CMU/Berkeley/PARC/UMD/Cornell/CMU), no co-organized workshops or Simons overlap found. Circumstantial contact surface: same top-venue circuit (e.g., CCS 2016 — she on PC, he presenting a DP-couplings paper), mutual citations (2 vs 7), and strong one-hop bridges — her confirmed PhD student Xiong Fan (advisor line verified on his CV) co-authored EasyPQC (CCS 2021) with Strub, and Jonathan Katz bridges both. These make casual conference contact plausible but no substantive meeting is evidenced.

**Why the score:** Novelty is real (7/10): his formal-methods line is outside her toolset, and there is a concrete two-way artifact — EasyCrypt-mechanized proofs of differential obliviousness (a DP-style relational property, exactly what Barthe-Grégoire-Strub coupling logics were built for), machine-checked ORAM/OPRAM proofs (an area with a history of buggy hand proofs), or Jasmin-verified oblivious/PQ implementations; he gets high-value proof targets, she gets assurance. But discovery is heavily discounted: ~40% chance they have already interacted, and reachability is trivial — her own former student and her long-time co-author Katz sit directly between them, and both are prominent figures who cite each other. Net discovery 3.5/10.

**Critical caveats:** Could not enumerate all PC rosters or workshop attendance (EasyCrypt schools, Dagstuhl seminars) — a shared Dagstuhl or PC would push met likelihood well above 40%. The 7 citations of Shi by Strub's side were not individually inspected. Strub's move to industry (PQShield, PQ implementation focus) may reduce his bandwidth for a theory-heavy academic collaboration, cutting the practical payoff below the on-paper fit. The 'strongest non-crypto line' framing is strained here — his formal-methods work is thoroughly crypto-entangled, so this pairing adds methodology, not new territory.

## Shared substrate
Both live in provable security, just with different instruments. The coupling logics he built with Barthe and Grégoire (apRHL, EasyCrypt's DP support) were designed to mechanize exactly the relational, DP-style properties that differential obliviousness is; his group presented a DP-couplings paper at CCS 2016 while she served on that PC. Her former PhD student Xiong Fan co-authored EasyPQC with him, and Jonathan Katz has worked with both.

## Productive divergence
Machine-checked proof machinery is absent from her toolset, and her subfield needs it: ORAM and OPRAM proofs have a documented history of subtle hand-proof bugs. He can mechanize her differential obliviousness definitions in EasyCrypt and compile verified constant-time oblivious code through Jasmin; she supplies proof targets hard enough to be worth his time.

## Seed questions for the conversation
- Differential obliviousness is a relational property over access-pattern distributions. Can EasyCrypt's apRHL coupling logic express it as it stands, or does the logic need extension?
- Given the record of buggy hand proofs in the ORAM literature, which published ORAM or OPRAM proof would you pick first as a mechanization target?
- Could Jasmin emit implementations whose obliviousness, not just constant-timeness, is checked at the compiler level?
- From PQShield's vantage point, which post-quantum deployments actually need oblivious memory rather than just constant-time code?

## Evidence — their most-cited work

- (2016, 292 cites) **Dependent types and multi-monadic effects in F***
- (2016, 219 cites) **Strong Non-Interference and Type-Directed Higher-Order Masking**
- (2015, 216 cites) **A Messy State of the Union: Taming the Composite State Machines of TLS**
- (2013, 175 cites) **Implementing TLS with Verified Cryptographic Security**
- (2011, 155 cites) **Secure distributed programming with value-dependent types** — *ACM SIGPLAN Notices*
- (2011, 139 cites) **Secure distributed programming with value-dependent types**
