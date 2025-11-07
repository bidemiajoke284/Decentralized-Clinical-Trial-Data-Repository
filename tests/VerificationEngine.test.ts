// VerificationEngine.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, someCV, noneCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_TRIAL_ID = 101;
const ERR_INVALID_SUBMISSION_ID = 102;
const ERR_VERIFICATION_ALREADY_EXISTS = 106;
const ERR_VERIFICATION_NOT_FOUND = 107;
const ERR_MAX_VERIFICATIONS_EXCEEDED = 110;
const ERR_INVALID_VERIFICATION_TYPE = 109;
const ERR_INVALID_STATUS = 104;
const ERR_INVALID_IPFS_HASH = 116;
const ERR_INVALID_SIGNATURE = 117;
const ERR_AUTHORITY_NOT_SET = 112;
const ERR_INVALID_FEE = 114;

interface Verification {
  trialId: number;
  submissionId: number;
  verifier: string;
  verificationType: string;
  status: string;
  evidence: string;
  ipfsHash: Uint8Array | null;
  timestamp: number;
  expiresAt: number | null;
  verifierType: string;
  signature: Uint8Array | null;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class VerificationEngineMock {
  state: {
    nextVerificationId: number;
    maxVerifications: number;
    verificationFee: number;
    authorityContract: string | null;
    verifications: Map<number, Verification>;
    verificationsByTrial: Map<number, number[]>;
    verificationsBySubmission: Map<number, number[]>;
    verificationsByVerifier: Map<string, number[]>;
    verificationStatus: Map<string, string>;
  } = {
    nextVerificationId: 0,
    maxVerifications: 20000,
    verificationFee: 500,
    authorityContract: null,
    verifications: new Map(),
    verificationsByTrial: new Map(),
    verificationsBySubmission: new Map(),
    verificationsByVerifier: new Map(),
    verificationStatus: new Map(),
  };
  blockHeight: number = 1000;
  caller: string = "ST1VERIFIER";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextVerificationId: 0,
      maxVerifications: 20000,
      verificationFee: 500,
      authorityContract: null,
      verifications: new Map(),
      verificationsByTrial: new Map(),
      verificationsBySubmission: new Map(),
      verificationsByVerifier: new Map(),
      verificationStatus: new Map(),
    };
    this.blockHeight = 1000;
    this.caller = "ST1VERIFIER";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: false };
    if (this.state.authorityContract !== null)
      return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setVerificationFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.verificationFee = newFee;
    return { ok: true, value: true };
  }

  submitVerification(
    trialId: number,
    submissionId: number,
    verificationType: string,
    status: string,
    evidence: string,
    ipfsHash: Uint8Array | null,
    expiresAt: number | null,
    verifierType: string,
    signature: Uint8Array | null
  ): Result<number> {
    if (this.state.nextVerificationId >= this.state.maxVerifications)
      return { ok: false, value: ERR_MAX_VERIFICATIONS_EXCEEDED };
    if (trialId <= 0) return { ok: false, value: ERR_INVALID_TRIAL_ID };
    if (submissionId <= 0)
      return { ok: false, value: ERR_INVALID_SUBMISSION_ID };
    if (
      ![
        "data-integrity",
        "protocol-compliance",
        "statistical-validity",
        "regulatory",
      ].includes(verificationType)
    )
      return { ok: false, value: ERR_INVALID_VERIFICATION_TYPE };
    if (!["pending", "approved", "rejected", "revoked"].includes(status))
      return { ok: false, value: ERR_INVALID_STATUS };
    if (evidence.length > 1024) return { ok: false, value: 105 };
    if (!["automated", "human", "ai", "consensus"].includes(verifierType))
      return { ok: false, value: 108 };
    if (ipfsHash !== null && ipfsHash.length !== 34)
      return { ok: false, value: ERR_INVALID_IPFS_HASH };
    if (signature !== null && signature.length !== 65)
      return { ok: false, value: ERR_INVALID_SIGNATURE };
    if (expiresAt !== null && expiresAt < this.blockHeight + 100)
      return { ok: false, value: 111 };
    const statusKey = `${trialId}-${submissionId}`;
    if (this.state.verificationStatus.has(statusKey))
      return { ok: false, value: ERR_VERIFICATION_ALREADY_EXISTS };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };

    this.stxTransfers.push({
      amount: this.state.verificationFee,
      from: this.caller,
      to: this.state.authorityContract,
    });

    const id = this.state.nextVerificationId;
    const verification: Verification = {
      trialId,
      submissionId,
      verifier: this.caller,
      verificationType,
      status,
      evidence,
      ipfsHash,
      timestamp: this.blockHeight,
      expiresAt,
      verifierType,
      signature,
    };
    this.state.verifications.set(id, verification);
    this.state.verificationStatus.set(statusKey, status);

    const trialList = this.state.verificationsByTrial.get(trialId) || [];
    if (trialList.length >= 300)
      return { ok: false, value: ERR_MAX_VERIFICATIONS_EXCEEDED };
    this.state.verificationsByTrial.set(trialId, [...trialList, id]);

    const subList =
      this.state.verificationsBySubmission.get(submissionId) || [];
    if (subList.length >= 300)
      return { ok: false, value: ERR_MAX_VERIFICATIONS_EXCEEDED };
    this.state.verificationsBySubmission.set(submissionId, [...subList, id]);

    const verifierList =
      this.state.verificationsByVerifier.get(this.caller) || [];
    if (verifierList.length >= 500)
      return { ok: false, value: ERR_MAX_VERIFICATIONS_EXCEEDED };
    this.state.verificationsByVerifier.set(this.caller, [...verifierList, id]);

    this.state.nextVerificationId++;
    return { ok: true, value: id };
  }

  updateVerificationStatus(
    verificationId: number,
    newStatus: string
  ): Result<boolean> {
    const verification = this.state.verifications.get(verificationId);
    if (!verification) return { ok: false, value: false };
    if (verification.verifier !== this.caller && !this.state.authorityContract)
      return { ok: false, value: false };
    if (!["pending", "approved", "rejected", "revoked"].includes(newStatus))
      return { ok: false, value: false };

    const updated = {
      ...verification,
      status: newStatus,
      timestamp: this.blockHeight,
    };
    this.state.verifications.set(verificationId, updated);
    this.state.verificationStatus.set(
      `${verification.trialId}-${verification.submissionId}`,
      newStatus
    );
    return { ok: true, value: true };
  }

  getVerification(id: number): Verification | null {
    return this.state.verifications.get(id) || null;
  }

  getCurrentStatus(trialId: number, submissionId: number): string | null {
    return (
      this.state.verificationStatus.get(`${trialId}-${submissionId}`) || null
    );
  }

  getVerificationCount(): Result<number> {
    return { ok: true, value: this.state.nextVerificationId };
  }
}

describe("VerificationEngine", () => {
  let contract: VerificationEngineMock;

  beforeEach(() => {
    contract = new VerificationEngineMock();
    contract.reset();
    contract.blockHeight = 1000;
  });

  it("submits verification successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const ipfs = new Uint8Array(34).fill(1);
    const sig = new Uint8Array(65).fill(2);
    const result = contract.submitVerification(
      1,
      10,
      "data-integrity",
      "approved",
      "Hash matches expected",
      ipfs,
      null,
      "automated",
      sig
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const verification = contract.getVerification(0);
    expect(verification?.verificationType).toBe("data-integrity");
    expect(verification?.status).toBe("approved");
    expect(verification?.evidence).toBe("Hash matches expected");
    expect(verification?.verifierType).toBe("automated");
    expect(verification?.ipfsHash?.toString()).toBe(ipfs.toString());
    expect(verification?.signature?.toString()).toBe(sig.toString());
    expect(contract.stxTransfers).toEqual([
      { amount: 500, from: "ST1VERIFIER", to: "ST2AUTH" },
    ]);
    expect(contract.getCurrentStatus(1, 10)).toBe("approved");
  });

  it("rejects duplicate verification for same trial-submission", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.submitVerification(
      1,
      10,
      "data-integrity",
      "approved",
      "ok",
      null,
      null,
      "automated",
      null
    );
    const result = contract.submitVerification(
      1,
      10,
      "protocol-compliance",
      "pending",
      "review",
      null,
      null,
      "human",
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_VERIFICATION_ALREADY_EXISTS);
  });

  it("updates status successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.submitVerification(
      1,
      10,
      "data-integrity",
      "pending",
      "waiting",
      null,
      null,
      "automated",
      null
    );
    const result = contract.updateVerificationStatus(0, "approved");
    expect(result.ok).toBe(true);
    expect(contract.getVerification(0)?.status).toBe("approved");
    expect(contract.getCurrentStatus(1, 10)).toBe("approved");
  });

  it("rejects invalid IPFS hash length", () => {
    contract.setAuthorityContract("ST2AUTH");
    const badHash = new Uint8Array(33);
    const result = contract.submitVerification(
      1,
      10,
      "data-integrity",
      "approved",
      "ok",
      badHash,
      null,
      "automated",
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_IPFS_HASH);
  });

  it("indexes by trial, submission, and verifier", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.submitVerification(
      1,
      10,
      "data-integrity",
      "approved",
      "",
      null,
      null,
      "automated",
      null
    );
    contract.submitVerification(
      1,
      20,
      "protocol-compliance",
      "pending",
      "",
      null,
      null,
      "human",
      null
    );
    contract.caller = "ST2VERIFIER";
    contract.submitVerification(
      2,
      30,
      "statistical-validity",
      "rejected",
      "",
      null,
      null,
      "ai",
      null
    );

    expect(contract.state.verificationsByTrial.get(1)).toEqual([0, 1]);
    expect(contract.state.verificationsBySubmission.get(10)).toEqual([0]);
    expect(contract.state.verificationsByVerifier.get("ST1VERIFIER")).toEqual([
      0, 1,
    ]);
    expect(contract.state.verificationsByVerifier.get("ST2VERIFIER")).toEqual([
      2,
    ]);
  });

  it("enforces max verifications per index", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.state.maxVerifications = 1000;
    for (let i = 0; i < 300; i++) {
      contract.submitVerification(
        1,
        i + 1,
        "data-integrity",
        "approved",
        "",
        null,
        null,
        "automated",
        null
      );
    }
    const result = contract.submitVerification(
      1,
      301,
      "data-integrity",
      "approved",
      "",
      null,
      null,
      "automated",
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_VERIFICATIONS_EXCEEDED);
  });

  it("returns correct verification count", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.submitVerification(
      1,
      1,
      "data-integrity",
      "approved",
      "",
      null,
      null,
      "automated",
      null
    );
    contract.submitVerification(
      2,
      2,
      "protocol-compliance",
      "pending",
      "",
      null,
      null,
      "human",
      null
    );
    const result = contract.getVerificationCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });
});
