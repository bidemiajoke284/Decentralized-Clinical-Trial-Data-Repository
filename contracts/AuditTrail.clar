(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-TRIAL-ID u101)
(define-constant ERR-INVALID-SUBMISSION-ID u102)
(define-constant ERR-INVALID-EVENT-TYPE u103)
(define-constant ERR-INVALID-DESCRIPTION u104)
(define-constant ERR-INVALID-METADATA-LENGTH u105)
(define-constant ERR-MAX-ENTRIES-EXCEEDED u106)
(define-constant ERR-INVALID-UPDATE-PARAM u107)
(define-constant ERR-AUTHORITY-NOT-SET u108)
(define-constant ERR-INVALID-AUTHORITY u109)
(define-constant ERR-INVALID-FEE u110)
(define-constant ERR-INVALID-EVENT-TYPE-LENGTH u111)
(define-constant ERR-INVALID-RELATED-TYPE u112)
(define-constant ERR-INVALID-RELATED-ID u113)
(define-constant ERR-INVALID-IPFS-HASH u114)
(define-constant ERR-TRANSFER-FAILED u115)

(define-data-var next-entry-id uint u0)
(define-data-var max-entries uint u50000)
(define-data-var logging-fee uint u100)
(define-data-var authority-contract (optional principal) none)

(define-map audit-entries
  uint
  {
    event-type: (string-utf8 100),
    trial-id: (optional uint),
    submission-id: (optional uint),
    actor: principal,
    timestamp: uint,
    description: (string-utf8 512),
    metadata: (string-utf8 1024),
    related-type: (string-utf8 50),
    related-id: (optional uint),
    ipfs-hash: (optional (buff 34))
  }
)

(define-map entries-by-trial uint (list 500 uint))
(define-map entries-by-submission uint (list 500 uint))
(define-map entries-by-actor principal (list 1000 uint))

(define-read-only (get-entry (id uint))
  (map-get? audit-entries id)
)

(define-read-only (get-entries-by-trial (trial-id uint))
  (default-to (list) (map-get? entries-by-trial trial-id))
)

(define-read-only (get-entries-by-submission (submission-id uint))
  (default-to (list) (map-get? entries-by-submission submission-id))
)

(define-read-only (get-entries-by-actor (actor principal))
  (default-to (list) (map-get? entries-by-actor actor))
)

(define-private (validate-trial-id (id (optional uint)))
  (match id tid (if (> tid u0) (ok true) (err ERR-INVALID-TRIAL-ID)) (ok true))
)

(define-private (validate-submission-id (id (optional uint)))
  (match id sid (if (> sid u0) (ok true) (err ERR-INVALID-SUBMISSION-ID)) (ok true))
)

(define-private (validate-event-type (et (string-utf8 100)))
  (if (and (> (len et) u0) (<= (len et) u100)) (ok true) (err ERR-INVALID-EVENT-TYPE-LENGTH))
)

(define-private (validate-description (desc (string-utf8 512)))
  (if (<= (len desc) u512) (ok true) (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-metadata (meta (string-utf8 1024)))
  (if (<= (len meta) u1024) (ok true) (err ERR-INVALID-METADATA-LENGTH))
)

(define-private (validate-related-type (rt (string-utf8 50)))
  (if (or (is-eq rt "trial") (is-eq rt "submission") (is-eq rt "role") (is-eq rt "permission"))
      (ok true)
      (err ERR-INVALID-RELATED-TYPE))
)

(define-private (validate-related-id (id (optional uint)))
  (match id rid (if (> rid u0) (ok true) (err ERR-INVALID-RELATED-ID)) (ok true))
)

(define-private (validate-ipfs-hash (hash (optional (buff 34))))
  (match hash h (if (is-eq (len h) u34) (ok true) (err ERR-INVALID-IPFS-HASH)) (ok true))
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

(define-public (set-max-entries (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set max-entries new-max)
    (ok true)
  )
)

(define-public (set-logging-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-FEE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set logging-fee new-fee)
    (ok true)
  )
)

(define-public (log-event
  (event-type (string-utf8 100))
  (trial-id (optional uint))
  (submission-id (optional uint))
  (description (string-utf8 512))
  (metadata (string-utf8 1024))
  (related-type (string-utf8 50))
  (related-id (optional uint))
  (ipfs-hash (optional (buff 34)))
)
  (let (
        (next-id (var-get next-entry-id))
        (current-max (var-get max-entries))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-ENTRIES-EXCEEDED))
    (try! (validate-event-type event-type))
    (try! (validate-trial-id trial-id))
    (try! (validate-submission-id submission-id))
    (try! (validate-description description))
    (try! (validate-metadata metadata))
    (try! (validate-related-type related-type))
    (try! (validate-related-id related-id))
    (try! (validate-ipfs-hash ipfs-hash))
    (let ((recipient (unwrap! authority (err ERR-AUTHORITY-NOT-SET))))
      (try! (stx-transfer? (var-get logging-fee) tx-sender recipient))
    )
    (map-set audit-entries next-id
      {
        event-type: event-type,
        trial-id: trial-id,
        submission-id: submission-id,
        actor: tx-sender,
        timestamp: block-height,
        description: description,
        metadata: metadata,
        related-type: related-type,
        related-id: related-id,
        ipfs-hash: ipfs-hash
      }
    )
    (match trial-id
      tid (map-set entries-by-trial tid
            (unwrap! (as-max-len? (append (default-to (list) (map-get? entries-by-trial tid)) next-id) u500) (err ERR-MAX-ENTRIES-EXCEEDED)))
      (begin))
    (match submission-id
      sid (map-set entries-by-submission sid
            (unwrap! (as-max-len? (append (default-to (list) (map-get? entries-by-submission sid)) next-id) u500) (err ERR-MAX-ENTRIES-EXCEEDED)))
      (begin))
    (map-set entries-by-actor tx-sender
      (unwrap! (as-max-len? (append (default-to (list) (map-get? entries-by-actor tx-sender)) next-id) u1000) (err ERR-MAX-ENTRIES-EXCEEDED))
    )
    (var-set next-entry-id (+ next-id u1))
    (print { event: "audit-logged", id: next-id })
    (ok next-id)
  )
)

(define-public (get-entry-count)
  (ok (var-get next-entry-id))
)