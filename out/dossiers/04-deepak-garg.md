# Deepak Garg
*Max Planck Institute for Software Systems (MPI-SWS), Saarbrücken; also Professor at Saarland University* — CMU-trained programming-languages and formal-verification researcher heading MPI-SWS's Foundations of Computer Security group; recent work spans MPC compiler testing, TEE+MPC secure analytics (CoVault), and information-flow control.

📄 **[Paper-level discussion draft → ../syntheses/shi-x-deepak-garg.md](../syntheses/shi-x-deepak-garg.md)**

**Bridge type:** ORAM & MPC theory ↔ programming languages, verification, and TEE systems  
**Citation tier:** ➡️ one-way inbound — they cite the anchor, she doesn't track them (distinct papers: they cite her ×4, she cites them ×0) (their ref coverage 76%; zeros are lower bounds)  
**Path to Elaine Shi:** two hops, via Matthew Lentz (6 joint papers), Bobby Bhattacharjee (5 joint papers), Peter Druschel (23 joint papers), Jon McCune (1 joint papers), Michael K. Reiter (4 joint papers), Gilles Barthe (20 joint papers)  
**Productive-distance signal:** overlap 0.214 · reach 0.525 · bridge-score 0.1723 · engine discovery 0.1334

## ⚖️ Critical assessment
**Discovery 3.5/10** · novelty 7/10 · met-likelihood 60% (engine prior 0.226) · reviewer confidence medium

> Real intellectual complementarity — his PL/verification and MPC-compiler-testing toolkit plus CoVault's TEE+MPC oblivious analytics could pair concretely with her ORAM/differential-obliviousness agenda (e.g., formally verified oblivious algorithms, or her DO algorithms inside CoVault's oblivious MapReduce). But this is a weak DISCOVERY: they were PhD students in the same CMU CS department in overlapping security groups (~2004-2008), share one-hop co-authors from her own PhD lab (Jon McCune, Michael Reiter), and he already cites her in 4 papers — so they plausibly know each other and are trivially reachable regardless. Worth the hour only if verified obliviousness is on her roadmap; not a surprising find.

**Already met?** No co-authorship, shared PC, or co-organized workshop found (checked DBLP for both, Garg's MPI-SWS papers/service pages, joint-name web search). However: Garg's PhD was in CMU CSD under Pfenning (defended Dec 2009, security/authorization logic), overlapping Shi's CMU PhD under Perrig (~2002-2008) in the same department/CyLab security orbit; his OpenAlex bridges include Jon McCune (Perrig student, Shi's labmate; 1 joint work) and Michael Reiter (CMU CyLab faculty then; 4 joint works); he cites her in 4 papers. Co-location plus two one-hop links into her PhD lab push met probability well above the engine's 0.226 prior despite zero documented direct interaction.

**Why the score:** Novelty is genuinely good (7/10): his strongest lines — information-flow type systems, formal verification, MPC compiler correctness testing, and CoVault's TEE+MPC data-oblivious analytics — are exactly the PL/systems complement to her theory-side obliviousness work, with concrete two-way artifacts (formally verified ORAM/differentially-oblivious algorithms; her DO constructions deployed in CoVault; her MPC constructions as targets for his compiler-testing methodology). But discovery is heavily discounted: ~60% chance of prior substantive acquaintance from CMU 2004-2008 and 18 years in adjacent security communities, and near-zero reach cost — she could email him cold (he cites her) or get an intro via Reiter/McCune in a day. Net discovery 3.5/10.

**Critical caveats:** Met-likelihood estimate rests on inferred co-location, not documented interaction — CMU CSD (Pfenning's logic group) and CyLab/ECE were socially distinct, and Shi may have spent later PhD years partly at PARC/Berkeley orbit, so 60% could be too high; conversely CSF-community vs CRYPTO-community separation since 2010 means they may never have actually talked. I could not enumerate full PC memberships for IEEE S&P/CCS across 2010-2025 (rosters not indexed well), so a shared PC year may have been missed, which would push met likelihood higher. Novelty assumes she has appetite for formal verification of obliviousness; if she views PL verification as low priority, the concrete artifact case weakens.

## Shared substrate
They overlapped as PhD students in CMU's CS department in the mid-2000s (he under Pfenning, she under Perrig) and share one-hop co-authors from her own PhD lab, Jon McCune and Michael Reiter. His CoVault system does data-oblivious analytics over TEEs plus MPC, which is her ObliVM and ORAM territory rebuilt from the systems side, and he cites her in four papers.

## Productive divergence
He brings information-flow type systems, formal verification, and a systematic testing methodology for MPC compilers, none of which exist in her group. Her ObliVM is exactly the kind of compiler his testing methodology targets, and CoVault's oblivious MapReduce pays full-obliviousness costs where her differentially oblivious algorithms could cut them. Verified obliviousness is a project neither side can do alone.

## Seed questions for the conversation
- Your MPC compiler-testing work turned up real bugs. What were the dominant bug classes, and would an oblivious-computation compiler like ObliVM show the same failure modes?
- CoVault's oblivious MapReduce pays full-obliviousness overhead everywhere. Where would differentially oblivious operators give a measurable win, and what leakage budget would your deployments tolerate?
- Can information-flow type systems express 'oblivious up to a bounded leakage function' as a static guarantee, or is that beyond current IFC machinery?
- You have worked on adaptive data analysis. Does differential obliviousness compose under adaptivity the way DP does, and is there a verification story for that composition?

## Evidence — recent work (citation counts pending API budget reset)

- (2026) **Endangered by the Language But Saved by the Compiler: Robust Safety via Semantic Back-Translation**
- (2026) **A Recipe for Modular Verification of Generic Tree Traversals**
- (2026) **The Efficacy of Metadata Analysis in Detecting Deepfakes: A Forensic Perspective**
- (2026) **Cost-Effective Testing of MPC Compilers**
- (2025) **Fusing Session-Typed Concurrent Programming into Functional Programming**
- (2025) **Unraveling Microscopic Origin of Nb 4d Transition-Metal-Induced Magnetic Anisotropy Evolution in W/CoFeB Heterostructures**
