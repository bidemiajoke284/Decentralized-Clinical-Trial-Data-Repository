;; AccessControl.clar

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-TRIAL-ID u101)
(define-constant ERR-INVALID-SUBMISSION-ID u102)
(define-constant ERR-INVALID-PRINCIPAL u103)
(define-constant ERR-INVALID-ROLE u104)
(define-constant ERR-ROLE-ALREADY-ASSIGNED u105)
(define-constant ERR-ROLE-NOT-FOUND u106)
(define-constant ERR-INVALID-PERMISSION u107)
(define-constant ERR-PERMISSION-ALREADY-GRANTED u108)
(define-constant ERR-PERMISSION-NOT-FOUND u109)
(define-constant ERR-INVALID-EXPIRY u110)
(define-constant ERR-EXPIRY-IN-PAST u111)
(define-constant ERR-INVALID-STATUS u112)
(define-constant ERR-AUTHORITY-NOT-SET u113)
(define-constant ERR-INVALID-AUTHORITY u114)
(define-constant ERR-INVALID-UPDATE-PARAM u115)
(define-constant ERR-ROLE-REVOCATION-FAILED u116)
(define-constant ERR-PERMISSION-REVOCATION-FAILED u117)
(define-constant ERR-INVALID-ROLE-TYPE u118)
(define-constant ERR-INVALID-PERMISSION-TYPE u119)
(define-constant ERR-MAX-ROLES-EXCEEDED u120)
(define-constant ERR-MAX-PERMISSIONS-EXCEEDED u121)
(define-constant ERR-INVALID-BLOCK-HEIGHT u122)
(define-constant ERR-SELF-ASSIGNMENT u123)
(define-constant ERR-SELF-REVOCATION u124)
(define-constant ERR-INVALID-EXPIRY-RANGE u125)
(define-constant ERR-PERMISSION-EXPIRED u126)
(define-constant ERR-ROLE-EXPIRED u127)
(define-constant ERR-INVALID-CONTEXT u128)
(define-constant ERR-INVALID-RESOURCE u129)
(define-constant ERR-INVALID-ACTION u130)

(define-data-var next-role-id uint u0)
(define-data-var next-permission-id uint u0)
(define-data-var max-roles uint u1000)
(define-data-var max-permissions uint u5000)
(define-data-var authority-contract (optional principal) none)

(define-map roles
  uint
  {
    trial-id: uint,
    principal: principal,
    role-type: (string-utf8 50),
    assigned-at: uint,
    expires-at: (optional uint),
    status: bool,
    assigner: principal
  }
)

(define-map permissions
  uint
  {
    trial-id: uint,
    submission-id: (optional uint),
    principal: principal,
    action: (string-utf8 50),
    resource: (string-utf8 50),
    granted-at: uint,
    expires-at: (optional uint),
    status: bool,
    granter: principal
  }
)

(define-map roles-by-principal-trial
  { principal: principal, trial-id: uint }
  (list 10 uint)
)

(define-map permissions-by-principal-trial
  { principal: principal, trial-id: uint }
  (list 20 uint)
)

(define-read-only (get-role (id uint))
  (map-get? roles id)
)

(define-read-only (get-permission (id uint))
  (map-get? permissions id)
)

(define-read-only (get-roles-by-principal-trial (principal principal) (trial-id uint))
  (map-get? roles-by-principal-trial { principal: principal, trial-id: trial-id })
)

(define-read-only (get-permissions-by-principal-trial (principal principal) (trial-id uint))
  (map-get? permissions-by-principal-trial { principal: principal, trial-id: trial-id })
)

(define-read-only (has-active-role (principal principal) (trial-id uint) (role-type (string-utf8 50)))
  (let ((role-ids (default-to (list) (get-roles-by-principal-trial principal trial-id))))
    (fold check-role role-ids false)
  )
)

(define-read-only (has-active-permission (principal principal) (trial-id uint) (action (string-utf8 50)) (resource (string-utf8 50)))
  (let ((perm-ids (default-to (list) (get-permissions-by-principal-trial principal trial-id))))
    (fold check-permission perm-ids false)
  )
)

(define-private (check-role (role-id uint) (found bool))
  (if found
      true
      (match (map-get? roles role-id)
        role
          (and
            (get status role)
            (is-eq (get role-type role) "researcher")
            (or (is-none (get expires-at role)) (>= (unwrap! (get expires-at role) false) block-height))
          )
        false
      )
  )
)

(define-private (check-permission (perm-id uint) (found bool))
  (if found
      true
      (match (map-get? permissions perm-id)
        perm
          (and
            (get status perm)
            (is-eq (get action perm) "read")
            (is-eq (get resource perm) "submission")
            (or (is-none (get expires-at perm)) (>= (unwrap! (get expires-at perm) false) block-height))
          )
        false
      )
  )
)

(define-private (validate-trial-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-TRIAL-ID))
)

(define-private (validate-submission-id (id (optional uint)))
  (match id
    sid (if (> sid u0) (ok true) (err ERR-INVALID-SUBMISSION-ID))
    (ok true)
  )
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-AUTHORITY))
)

(define-private (validate-role-type (rt (string-utf8 50)))
  (if (or (is-eq rt "sponsor") (is-eq rt "researcher") (is-eq rt "regulator") (is-eq rt "auditor"))
      (ok true)
      (err ERR-INVALID-ROLE-TYPE))
)

(define-private (validate-action (act (string-utf8 50)))
  (if (or (is-eq act "read") (is-eq act "write") (is-eq act "verify") (is-eq act "submit"))
      (ok true)
      (err ERR-INVALID-ACTION))
)

(define-private (validate-resource (res (string-utf8 50)))
  (if (or (is-eq res "trial") (is-eq res "submission") (is-eq res "metadata") (is-eq res "report"))
      (ok true)
      (err ERR-INVALID-RESOURCE))
)

(define-private (validate-expiry (exp (optional uint)))
  (match exp
    e (if (>= e (+ block-height u100)) (ok true) (err ERR-INVALID-EXPIRY-RANGE))
    (ok true)
  )
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (assign-role
  (trial-id uint)
  (target-principal principal)
  (role-type (string-utf8 50))
  (expires-at (optional uint))
)
  (let (
        (next-id (var-get next-role-id))
        (current-max (var-get max-roles))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-ROLES-EXCEEDED))
    (try! (validate-trial-id trial-id))
    (try! (validate-principal target-principal))
    (try! (validate-role-type role-type))
    (try! (validate-expiry expires-at))
    (asserts! (not (is-eq target-principal tx-sender)) (err ERR-SELF-ASSIGNMENT))
    (let ((existing-roles (default-to (list) (get-roles-by-principal-trial target-principal trial-id))))
      (asserts! (not (fold has-role-type existing-roles false)) (err ERR-ROLE-ALREADY-ASSIGNED))
    )
    (map-set roles next-id
      {
        trial-id: trial-id,
        principal: target-principal,
        role-type: role-type,
        assigned-at: block-height,
        expires-at: expires-at,
        status: true,
        assigner: tx-sender
      }
    )
    (map-set roles-by-principal-trial
      { principal: target-principal, trial-id: trial-id }
      (unwrap! (as-max-len? (append (default-to (list) (get-roles-by-principal-trial target-principal trial-id)) next-id) u10) (err ERR-MAX-ROLES-EXCEEDED))
    )
    (var-set next-role-id (+ next-id u1))
    (print { event: "role-assigned", id: next-id })
    (ok next-id)
  )
)

(define-public (revoke-role (role-id uint))
  (let ((role (map-get? roles role-id)))
    (match role
      r
        (begin
          (asserts! (or (is-eq (get assigner r) tx-sender) (is-some (var-get authority-contract))) (err ERR-NOT-AUTHORIZED))
          (asserts! (not (is-eq (get principal r) tx-sender)) (err ERR-SELF-REVOCATION))
          (map-set roles role-id
            (merge r { status: false })
          )
          (print { event: "role-revoked", id: role-id })
          (ok true)
        )
      (err ERR-ROLE-NOT-FOUND)
    )
  )
)

(define-public (grant-permission
  (trial-id uint)
  (submission-id (optional uint))
  (target-principal principal)
  (action (string-utf8 50))
  (resource (string-utf8 50))
  (expires-at (optional uint))
)
  (let (
        (next-id (var-get next-permission-id))
        (current-max (var-get max-permissions))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-PERMISSIONS-EXCEEDED))
    (try! (validate-trial-id trial-id))
    (try! (validate-submission-id submission-id))
    (try! (validate-principal target-principal))
    (try! (validate-action action))
    (try! (validate-resource resource))
    (try! (validate-expiry expires-at))
    (asserts! (not (is-eq target-principal tx-sender)) (err ERR-SELF-ASSIGNMENT))
    (map-set permissions next-id
      {
        trial-id: trial-id,
        submission-id: submission-id,
        principal: target-principal,
        action: action,
        resource: resource,
        granted-at: block-height,
        expires-at: expires-at,
        status: true,
        granter: tx-sender
      }
    )
    (map-set permissions-by-principal-trial
      { principal: target-principal, trial-id: trial-id }
      (unwrap! (as-max-len? (append (default-to (list) (get-permissions-by-principal-trial target-principal trial-id)) next-id) u20) (err ERR-MAX-PERMISSIONS-EXCEEDED))
    )
    (var-set next-permission-id (+ next-id u1))
    (print { event: "permission-granted", id: next-id })
    (ok next-id)
  )
)

(define-public (revoke-permission (permission-id uint))
  (let ((perm (map-get? permissions permission-id)))
    (match perm
      p
        (begin
          (asserts! (or (is-eq (get granter p) tx-sender) (is-some (var-get authority-contract))) (err ERR-NOT-AUTHORIZED))
          (asserts! (not (is-eq (get principal p) tx-sender)) (err ERR-SELF-REVOCATION))
          (map-set permissions permission-id
            (merge p { status: false })
          )
          (print { event: "permission-revoked", id: permission-id })
          (ok true)
        )
      (err ERR-PERMISSION-NOT-FOUND)
    )
  )
)

(define-public (check-access
  (principal principal)
  (trial-id uint)
  (submission-id (optional uint))
  (action (string-utf8 50))
  (resource (string-utf8 50))
)
  (let (
        (has-role (has-active-role principal trial-id "sponsor"))
        (has-perm (has-active-permission principal trial-id action resource))
      )
    (ok (or has-role has-perm))
  )
)

(define-private (has-role-type (role-id uint) (found bool))
  (if found
      true
      (match (map-get? roles role-id)
        r (and (get status r) (is-eq (get role-type r) "sponsor"))
        false
      )
  )
)