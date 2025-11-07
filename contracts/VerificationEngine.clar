;; VerificationEngine.clar

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-TRIAL-ID u101)
(define-constant ERR-INVALID-SUBMISSION-ID u102)
(define-constant ERR-INVALID-VERIFIER u103)
(define-constant ERR-INVALID-STATUS u104)
(define-constant ERR-INVALID-EVIDENCE-LENGTH u105)
(define-constant ERR-VERIFICATION-ALREADY-EXISTS u106)
(define-constant ERR-VERIFICATION-NOT-FOUND u107)
(define-constant ERR-INVALID-VERIFIER-TYPE u108)
(define-constant ERR-INVALID-VERIFICATION-TYPE u109)
(define-constant ERR-MAX-VERIFICATIONS-EXCEEDED u110)
(define-constant ERR-INVALID-BLOCK-HEIGHT u111)
(define-constant ERR-AUTHORITY-NOT-SET u112)
(define-constant ERR-INVALID-AUTHORITY u113)
(define-constant ERR-INVALID-FEE u114)
(define-constant ERR-TRANSFER-FAILED u115)
(define-constant ERR-INVALID-IPFS-HASH u116)
(define-constant ERR-INVALID-SIGNATURE u117)

(define-data-var next-verification-id uint u0)
(define-data-var max-verifications uint u20000)
(define-data-var verification-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map verifications
  uint
  {
    trial-id: uint,
    submission-id: uint,
    verifier: principal,
    verification-type: (string-utf8 50),
    status: (string-utf8 50),
    evidence: (string-utf8 1024),
    ipfs-hash: (optional (buff 34)),
    timestamp: uint,
    expires-at: (optional uint),
    verifier-type: (string-utf8 50),
    signature: (optional (buff 65))
  }
)

(define-map verifications-by-trial uint (list 300 uint))
(define-map verifications-by-submission uint (list 300 uint))
(define-map verifications-by-verifier principal (list 500 uint))
(define-map verification-status { trial-id: uint, submission-id: uint } (string-utf8 50))

(define-read-only (get-verification (id uint))
  (map-get? verifications id)
)

(define-read-only (get-verifications-by-trial (trial-id uint))
  (default-to (list) (map-get? verifications-by-trial trial-id))
)

(define-read-only (get-verifications-by-submission (submission-id uint))
  (default-to (list) (map-get? verifications-by-submission submission-id))
)

(define-read-only (get-verifications-by-verifier (verifier principal))
  (default-to (list) (map-get? verifications-by-verifier verifier))
)

(define-read-only (get-current-status (trial-id uint) (submission-id uint))
  (map-get? verification-status { trial-id: trial-id, submission-id: submission-id })
)

(define-private (validate-trial-id (id uint))
  (if (> id u0) (ok true) (err ERR-INVALID-TRIAL-ID))
)

(define-private (validate-submission-id (id uint))
  (if (> id u0) (ok true) (err ERR-INVALID-SUBMISSION-ID))
)

(define-private (validate-verification-type (vt (string-utf8 50)))
  (if (or (is-eq vt "data-integrity") (is-eq vt "protocol-compliance") (is-eq vt "statistical-validity") (is-eq vt "regulatory"))
      (ok true)
      (err ERR-INVALID-VERIFICATION-TYPE))
)

(define-private (validate-status (st (string-utf8 50)))
  (if (or (is-eq st "pending") (is-eq st "approved") (is-eq st "rejected") (is-eq st "revoked"))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-private (validate-evidence (ev (string-utf8 1024)))
  (if (<= (len ev) u1024) (ok true) (err ERR-INVALID-EVIDENCE-LENGTH))
)

(define-private (validate-verifier-type (vt (string-utf8 50)))
  (if (or (is-eq vt "automated") (is-eq vt "human") (is-eq vt "ai") (is-eq vt "consensus"))
      (ok true)
      (err ERR-INVALID-VERIFIER-TYPE))
)

(define-private (validate-ipfs-hash (hash (optional (buff 34))))
  (match hash h (if (is-eq (len h) u34) (ok true) (err ERR-INVALID-IPFS-HASH)) (ok true))
)

(define-private (validate-signature (sig (optional (buff 65))))
  (match sig s (if (is-eq (len s) u65) (ok true) (err ERR-INVALID-SIGNATURE)) (ok true))
)

(define-private (validate-expiry (exp (optional uint)))
  (match exp e (if (>= e (+ block-height u100)) (ok true) (err ERR-INVALID-BLOCK-HEIGHT)) (ok true))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78)) (ok true) (err ERR-INVALID-AUTHORITY))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-verifications (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set max-verifications new-max)
    (ok true)
  )
)

(define-public (set-verification-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-FEE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set verification-fee new-fee)
    (ok true)
  )
)

(define-public (submit-verification
  (trial-id uint)
  (submission-id uint)
  (verification-type (string-utf8 50))
  (status (string-utf8 50))
  (evidence (string-utf8 1024))
  (ipfs-hash (optional (buff 34)))
  (expires-at (optional uint))
  (verifier-type (string-utf8 50))
  (signature (optional (buff 65)))
)
  (let (
        (next-id (var-get next-verification-id))
        (current-max (var-get max-verifications))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-VERIFICATIONS-EXCEEDED))
    (try! (validate-trial-id trial-id))
    (try! (validate-submission-id submission-id))
    (try! (validate-verification-type verification-type))
    (try! (validate-status status))
    (try! (validate-evidence evidence))
    (try! (validate-verifier-type verifier-type))
    (try! (validate-ipfs-hash ipfs-hash))
    (try! (validate-signature signature))
    (try! (validate-expiry expires-at))
    (asserts! (is-none (get-current-status trial-id submission-id)) (err ERR-VERIFICATION-ALREADY-EXISTS))
    (let ((recipient (unwrap! authority (err ERR-AUTHORITY-NOT-SET))))
      (try! (stx-transfer? (var-get verification-fee) tx-sender recipient))
    )
    (map-set verifications next-id
      {
        trial-id: trial-id,
        submission-id: submission-id,
        verifier: tx-sender,
        verification-type: verification-type,
        status: status,
        evidence: evidence,
        ipfs-hash: ipfs-hash,
        timestamp: block-height,
        expires-at: expires-at,
        verifier-type: verifier-type,
        signature: signature
      }
    )
    (map-set verification-status { trial-id: trial-id, submission-id: submission-id } status)
    (map-set verifications-by-trial trial-id
      (unwrap! (as-max-len? (append (default-to (list) (map-get? verifications-by-trial trial-id)) next-id) u300) (err ERR-MAX-VERIFICATIONS-EXCEEDED))
    )
    (map-set verifications-by-submission submission-id
      (unwrap! (as-max-len? (append (default-to (list) (map-get? verifications-by-submission submission-id)) next-id) u300) (err ERR-MAX-VERIFICATIONS-EXCEEDED))
    )
    (map-set verifications-by-verifier tx-sender
      (unwrap! (as-max-len? (append (default-to (list) (map-get? verifications-by-verifier tx-sender)) next-id) u500) (err ERR-MAX-VERIFICATIONS-EXCEEDED))
    )
    (var-set next-verification-id (+ next-id u1))
    (print { event: "verification-submitted", id: next-id })
    (ok next-id)
  )
)

(define-public (update-verification-status
  (verification-id uint)
  (new-status (string-utf8 50))
)
  (let ((verification (map-get? verifications verification-id)))
    (match verification
      v
        (begin
          (asserts! (or (is-eq (get verifier v) tx-sender) (is-some (var-get authority-contract))) (err ERR-NOT-AUTHORIZED))
          (try! (validate-status new-status))
          (map-set verifications verification-id
            (merge v { status: new-status, timestamp: block-height })
          )
          (map-set verification-status
            { trial-id: (get trial-id v), submission-id: (get submission-id v) }
            new-status
          )
          (print { event: "verification-updated", id: verification-id })
          (ok true)
        )
      (err ERR-VERIFICATION-NOT-FOUND)
    )
  )
)

(define-public (get-verification-count)
  (ok (var-get next-verification-id))
)