// Signatures support the ongoing letter. Copy edits do not require signing again.
// Original text stays on each record, and the latest status controls visibility.
export function signatureRowFor(subject = '?') {
  return `SELECT candidate.rowid FROM signatures candidate WHERE candidate.subject=${subject}
    ORDER BY candidate.submitted_at DESC, candidate.rowid DESC LIMIT 1`;
}
