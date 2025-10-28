(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-TRIAL-ID u101)
(define-constant ERR-INVALID-DATA-HASH u102)
(define-constant ERR-INVALID-DESCRIPTION u103)
(define-constant ERR-INVALID-TIMESTAMP u104)
(define-constant ERR-SUBMISSION-ALREADY-EXISTS u105)
(define-constant ERR-SUBMISSION-NOT-FOUND u106)
(define-constant ERR-INVALID-METADATA u107)
(define-constant ERR-INVALID-SUBMITTER u108)
(define-constant ERR-INVALID-STATUS u109)
(define-constant ERR-INVALID-PHASE u110)
(define-constant ERR-INVALID-PATIENT-COUNT u111)
(define-constant ERR-INVALID-OUTCOME-METRIC u112)
(define-constant ERR-INVALID-DATA-TYPE u113)
(define-constant ERR-INVALID-VERIFICATION u114)
(define-constant ERR-INVALID-ACCESS u115)
(define-constant ERR-INVALID-HASH-LENGTH u116)
(define-constant ERR-INVALID-DESCRIPTION-LENGTH u117)
(define-constant ERR-INVALID-METADATA-LENGTH u118)
(define-constant ERR-INVALID-PHASE-RANGE u119)
(define-constant ERR-INVALID-PATIENT-RANGE u120)
(define-constant ERR-INVALID-OUTCOME-RANGE u121)
(define-constant ERR-INVALID-DATA-TYPE-OPTION u122)
(define-constant ERR-MAX-SUBMISSIONS-EXCEEDED u123)
(define-constant ERR-INVALID-UPDATE-PARAM u124)
(define-constant ERR-UPDATE-NOT-ALLOWED u125)
(define-constant ERR-AUTHORITY-NOT-SET u126)
(define-constant ERR-INVALID-AUTHORITY u127)
(define-constant ERR-INVALID-FEE u128)
(define-constant ERR-TRANSFER-FAILED u129)
(define-constant ERR-INVALID-BLOCK-HEIGHT u130)

(define-data-var next-submission-id uint u0)
(define-data-var max-submissions uint u10000)
(define-data-var submission-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map submissions
  uint
  {
    trial-id: uint,
    data-hash: (buff 32),
    description: (string-utf8 256),
    timestamp: uint,
    submitter: principal,
    status: bool,
    phase: uint,
    patient-count: uint,
    outcome-metric: uint,
    data-type: (string-utf8 50),
    metadata: (string-utf8 512)
  }
)

(define-map submissions-by-hash
  (buff 32)
  uint
)

(define-map submission-updates
  uint
  {
    update-description: (string-utf8 256),
    update-status: bool,
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-submission (id uint))
  (map-get? submissions id)
)

(define-read-only (get-submission-updates (id uint))
  (map-get? submission-updates id)
)

(define-read-only (is-submission-registered (hash (buff 32)))
  (is-some (map-get? submissions-by-hash hash))
)

(define-private (validate-trial-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-TRIAL-ID))
)

(define-private (validate-data-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-HASH-LENGTH))
)

(define-private (validate-description (desc (string-utf8 256)))
  (if (and (> (len desc) u0) (<= (len desc) u256))
      (ok true)
      (err ERR-INVALID-DESCRIPTION-LENGTH))
)

(define-private (validate-metadata (meta (string-utf8 512)))
  (if (<= (len meta) u512)
      (ok true)
      (err ERR-INVALID-METADATA-LENGTH))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-status (st bool))
  (ok true)
)

(define-private (validate-phase (ph uint))
  (if (and (>= ph u1) (<= ph u4))
      (ok true)
      (err ERR-INVALID-PHASE-RANGE))
)

(define-private (validate-patient-count (count uint))
  (if (and (>= count u1) (<= count u10000))
      (ok true)
      (err ERR-INVALID-PATIENT-RANGE))
)

(define-private (validate-outcome-metric (metric uint))
  (if (and (>= metric u0) (<= metric u100))
      (ok true)
      (err ERR-INVALID-OUTCOME-RANGE))
)

(define-private (validate-data-type (dtype (string-utf8 50)))
  (if (or (is-eq dtype "raw") (is-eq dtype "aggregated") (is-eq dtype "anonymized"))
      (ok true)
      (err ERR-INVALID-DATA-TYPE-OPTION))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-AUTHORITY))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-submissions (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set max-submissions new-max)
    (ok true)
  )
)

(define-public (set-submission-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-FEE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set submission-fee new-fee)
    (ok true)
  )
)

(define-public (submit-data
  (trial-id uint)
  (data-hash (buff 32))
  (description (string-utf8 256))
  (phase uint)
  (patient-count uint)
  (outcome-metric uint)
  (data-type (string-utf8 50))
  (metadata (string-utf8 512))
)
  (let (
        (next-id (var-get next-submission-id))
        (current-max (var-get max-submissions))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-SUBMISSIONS-EXCEEDED))
    (try! (validate-trial-id trial-id))
    (try! (validate-data-hash data-hash))
    (try! (validate-description description))
    (try! (validate-phase phase))
    (try! (validate-patient-count patient-count))
    (try! (validate-outcome-metric outcome-metric))
    (try! (validate-data-type data-type))
    (try! (validate-metadata metadata))
    (asserts! (is-none (map-get? submissions-by-hash data-hash)) (err ERR-SUBMISSION-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-SET))))
      (try! (stx-transfer? (var-get submission-fee) tx-sender authority-recipient))
    )
    (map-set submissions next-id
      {
        trial-id: trial-id,
        data-hash: data-hash,
        description: description,
        timestamp: block-height,
        submitter: tx-sender,
        status: true,
        phase: phase,
        patient-count: patient-count,
        outcome-metric: outcome-metric,
        data-type: data-type,
        metadata: metadata
      }
    )
    (map-set submissions-by-hash data-hash next-id)
    (var-set next-submission-id (+ next-id u1))
    (print { event: "data-submitted", id: next-id })
    (ok next-id)
  )
)

(define-public (update-submission
  (submission-id uint)
  (update-description (string-utf8 256))
  (update-status bool)
)
  (let ((submission (map-get? submissions submission-id)))
    (match submission
      s
        (begin
          (asserts! (is-eq (get submitter s) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-description update-description))
          (try! (validate-status update-status))
          (map-set submissions submission-id
            {
              trial-id: (get trial-id s),
              data-hash: (get data-hash s),
              description: update-description,
              timestamp: block-height,
              submitter: (get submitter s),
              status: update-status,
              phase: (get phase s),
              patient-count: (get patient-count s),
              outcome-metric: (get outcome-metric s),
              data-type: (get data-type s),
              metadata: (get metadata s)
            }
          )
          (map-set submission-updates submission-id
            {
              update-description: update-description,
              update-status: update-status,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "submission-updated", id: submission-id })
          (ok true)
        )
      (err ERR-SUBMISSION-NOT-FOUND)
    )
  )
)

(define-public (verify-submission-hash (id uint) (provided-hash (buff 32)))
  (let ((submission (map-get? submissions id)))
    (match submission
      s
        (if (is-eq (get data-hash s) provided-hash)
            (ok true)
            (ok false))
      (err ERR-SUBMISSION-NOT-FOUND)
    )
  )
)

(define-public (get-submission-count)
  (ok (var-get next-submission-id))
)

(define-public (check-submission-existence (hash (buff 32)))
  (ok (is-submission-registered hash))
)