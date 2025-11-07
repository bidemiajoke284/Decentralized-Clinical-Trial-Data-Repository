
import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_TRIAL_ID = 101;
const ERR_INVALID_SUBMISSION_ID = 102;
const ERR_MAX_ENTRIES_EXCEEDED = 106;
const ERR_INVALID_EVENT_TYPE_LENGTH = 111;
const ERR_INVALID_METADATA_LENGTH = 105;
const ERR_INVALID_RELATED_TYPE = 112;
const ERR_INVALID_IPFS_HASH = 114;
const ERR_AUTHORITY_NOT_SET = 108;
const ERR_INVALID_FEE = 110;

interface AuditEntry {
  eventType: string;
  trialId: number | null;
  submissionId: number | null;
  actor: string;
  timestamp: number;
  description: string;
  metadata: string;
  relatedType: string;
  relatedId: number | null;
  ipfsHash: Uint8Array | null;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AuditTrailMock {
  state: {
    nextEntryId: number;
    maxEntries: number;
    loggingFee: number;
    authorityContract: string | null;
    auditEntries: Map<number, AuditEntry>;
    entriesByTrial: Map<number, number[]>;
    entriesBySubmission: Map<number, number[]>;
    entriesByActor: Map<string, number[]>;
  } = {
    nextEntryId: 0,
    maxEntries: 50000,
    loggingFee: 100,
    authorityContract: null,
    auditEntries: new Map(),
    entriesByTrial: new Map(),
    entriesBySubmission: new Map(),
    entriesByActor: new Map(),
  };
  blockHeight: number = 1000;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextEntryId: 0,
      maxEntries: 50000,
      loggingFee: 100,
      authorityContract: null,
      auditEntries: new Map(),
      entriesByTrial: new Map(),
      entriesBySubmission: new Map(),
      entriesByActor: new Map(),
    };
    this.blockHeight = 1000;
    this.caller = "ST1TEST";
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

  setLoggingFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.loggingFee = newFee;
    return { ok: true, value: true };
  }

  logEvent(
    eventType: string,
    trialId: number | null,
    submissionId: number | null,
    description: string,
    metadata: string,
    relatedType: string,
    relatedId: number | null,
    ipfsHash: Uint8Array | null
  ): Result<number> {
    if (this.state.nextEntryId >= this.state.maxEntries)
      return { ok: false, value: ERR_MAX_ENTRIES_EXCEEDED };
    if (!eventType || eventType.length > 100)
      return { ok: false, value: ERR_INVALID_EVENT_TYPE_LENGTH };
    if (trialId !== null && trialId <= 0)
      return { ok: false, value: ERR_INVALID_TRIAL_ID };
    if (submissionId !== null && submissionId <= 0)
      return { ok: false, value: ERR_INVALID_SUBMISSION_ID };
    if (description.length > 512) return { ok: false, value: 104 };
    if (metadata.length > 1024)
      return { ok: false, value: ERR_INVALID_METADATA_LENGTH };
    if (!["trial", "submission", "role", "permission"].includes(relatedType))
      return { ok: false, value: ERR_INVALID_RELATED_TYPE };
    if (relatedId !== null && relatedId <= 0) return { ok: false, value: 113 };
    if (ipfsHash !== null && ipfsHash.length !== 34)
      return { ok: false, value: ERR_INVALID_IPFS_HASH };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };

    this.stxTransfers.push({
      amount: this.state.loggingFee,
      from: this.caller,
      to: this.state.authorityContract,
    });

    const id = this.state.nextEntryId;
    const entry: AuditEntry = {
      eventType,
      trialId,
      submissionId,
      actor: this.caller,
      timestamp: this.blockHeight,
      description,
      metadata,
      relatedType,
      relatedId,
      ipfsHash,
    };
    this.state.auditEntries.set(id, entry);

    if (trialId !== null) {
      const list = this.state.entriesByTrial.get(trialId) || [];
      if (list.length >= 500)
        return { ok: false, value: ERR_MAX_ENTRIES_EXCEEDED };
      this.state.entriesByTrial.set(trialId, [...list, id]);
    }
    if (submissionId !== null) {
      const list = this.state.entriesBySubmission.get(submissionId) || [];
      if (list.length >= 500)
        return { ok: false, value: ERR_MAX_ENTRIES_EXCEEDED };
      this.state.entriesBySubmission.set(submissionId, [...list, id]);
    }
    const actorList = this.state.entriesByActor.get(this.caller) || [];
    if (actorList.length >= 1000)
      return { ok: false, value: ERR_MAX_ENTRIES_EXCEEDED };
    this.state.entriesByActor.set(this.caller, [...actorList, id]);

    this.state.nextEntryId++;
    return { ok: true, value: id };
  }

  getEntry(id: number): AuditEntry | null {
    return this.state.auditEntries.get(id) || null;
  }

  getEntryCount(): Result<number> {
    return { ok: true, value: this.state.nextEntryId };
  }
}

describe("AuditTrail", () => {
  let contract: AuditTrailMock;

  beforeEach(() => {
    contract = new AuditTrailMock();
    contract.reset();
    contract.blockHeight = 1000;
  });

  it("logs event successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const ipfs = new Uint8Array(34).fill(1);
    const result = contract.logEvent(
      "DATA_SUBMITTED",
      1,
      5,
      "Patient data uploaded",
      "Detailed log",
      "submission",
      5,
      ipfs
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const entry = contract.getEntry(0);
    expect(entry?.eventType).toBe("DATA_SUBMITTED");
    expect(entry?.trialId).toBe(1);
    expect(entry?.submissionId).toBe(5);
    expect(entry?.actor).toBe("ST1TEST");
    expect(entry?.timestamp).toBe(1000);
    expect(entry?.description).toBe("Patient data uploaded");
    expect(entry?.metadata).toBe("Detailed log");
    expect(entry?.relatedType).toBe("submission");
    expect(entry?.relatedId).toBe(5);
    expect(entry?.ipfsHash?.toString()).toBe(ipfs.toString());
    expect(contract.stxTransfers).toEqual([
      { amount: 100, from: "ST1TEST", to: "ST2AUTH" },
    ]);
  });

  it("rejects without authority contract", () => {
    const result = contract.logEvent(
      "TEST",
      null,
      null,
      "desc",
      "",
      "trial",
      null,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });

  it("rejects invalid ipfs hash length", () => {
    contract.setAuthorityContract("ST2AUTH");
    const badHash = new Uint8Array(33);
    const result = contract.logEvent(
      "TEST",
      null,
      null,
      "desc",
      "",
      "trial",
      null,
      badHash
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_IPFS_HASH);
  });

  it("indexes by trial, submission and actor", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.logEvent("E1", 10, null, "d", "", "trial", null, null);
    contract.logEvent("E2", 10, 20, "d", "", "submission", 20, null);
    contract.logEvent("E3", null, 30, "d", "", "role", null, null);

    expect(contract.state.entriesByTrial.get(10)).toEqual([0, 1]);
    expect(contract.state.entriesBySubmission.get(20)).toEqual([1]);
    expect(contract.state.entriesBySubmission.get(30)).toEqual([2]);
    expect(contract.state.entriesByActor.get("ST1TEST")).toEqual([0, 1, 2]);
  });

  it("sets logging fee successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.setLoggingFee(500);
    contract.logEvent("TEST", null, null, "desc", "", "trial", null, null);
    expect(contract.stxTransfers).toEqual([
      { amount: 500, from: "ST1TEST", to: "ST2AUTH" },
    ]);
  });

  it("returns correct entry count", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.logEvent("A", null, null, "", "", "trial", null, null);
    contract.logEvent("B", null, null, "", "", "trial", null, null);
    const result = contract.getEntryCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("enforces max entries", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.state.maxEntries = 1;
    contract.logEvent("A", null, null, "", "", "trial", null, null);
    const result = contract.logEvent(
      "B",
      null,
      null,
      "",
      "",
      "trial",
      null,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ENTRIES_EXCEEDED);
  });
});
