import { describe, it, expect, beforeEach } from "vitest";
import { buffCV, stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_TRIAL_ID = 101;
const ERR_INVALID_DATA_HASH = 102;
const ERR_INVALID_DESCRIPTION = 103;
const ERR_INVALID_PHASE = 110;
const ERR_INVALID_PATIENT_COUNT = 111;
const ERR_INVALID_OUTCOME_METRIC = 112;
const ERR_INVALID_DATA_TYPE = 113;
const ERR_INVALID_METADATA = 107;
const ERR_SUBMISSION_ALREADY_EXISTS = 105;
const ERR_SUBMISSION_NOT_FOUND = 106;
const ERR_MAX_SUBMISSIONS_EXCEEDED = 123;
const ERR_INVALID_UPDATE_PARAM = 124;
const ERR_AUTHORITY_NOT_SET = 126;
const ERR_INVALID_HASH_LENGTH = 116;
const ERR_INVALID_DESCRIPTION_LENGTH = 117;
const ERR_INVALID_METADATA_LENGTH = 118;
const ERR_INVALID_PHASE_RANGE = 119;
const ERR_INVALID_PATIENT_RANGE = 120;
const ERR_INVALID_OUTCOME_RANGE = 121;
const ERR_INVALID_DATA_TYPE_OPTION = 122;
const ERR_INVALID_FEE = 128;

interface Submission {
  trialId: number;
  dataHash: Uint8Array;
  description: string;
  timestamp: number;
  submitter: string;
  status: boolean;
  phase: number;
  patientCount: number;
  outcomeMetric: number;
  dataType: string;
  metadata: string;
}

interface SubmissionUpdate {
  updateDescription: string;
  updateStatus: boolean;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class DataSubmissionMock {
  state: {
    nextSubmissionId: number;
    maxSubmissions: number;
    submissionFee: number;
    authorityContract: string | null;
    submissions: Map<number, Submission>;
    submissionUpdates: Map<number, SubmissionUpdate>;
    submissionsByHash: Map<string, number>;
  } = {
    nextSubmissionId: 0,
    maxSubmissions: 10000,
    submissionFee: 500,
    authorityContract: null,
    submissions: new Map(),
    submissionUpdates: new Map(),
    submissionsByHash: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextSubmissionId: 0,
      maxSubmissions: 10000,
      submissionFee: 500,
      authorityContract: null,
      submissions: new Map(),
      submissionUpdates: new Map(),
      submissionsByHash: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  isVerifiedAuthority(principal: string): Result<boolean> {
    return { ok: true, value: this.authorities.has(principal) };
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setSubmissionFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.submissionFee = newFee;
    return { ok: true, value: true };
  }

  submitData(
    trialId: number,
    dataHash: Uint8Array,
    description: string,
    phase: number,
    patientCount: number,
    outcomeMetric: number,
    dataType: string,
    metadata: string
  ): Result<number> {
    if (this.state.nextSubmissionId >= this.state.maxSubmissions) return { ok: false, value: ERR_MAX_SUBMISSIONS_EXCEEDED };
    if (trialId <= 0) return { ok: false, value: ERR_INVALID_TRIAL_ID };
    if (dataHash.length !== 32) return { ok: false, value: ERR_INVALID_HASH_LENGTH };
    if (!description || description.length > 256) return { ok: false, value: ERR_INVALID_DESCRIPTION_LENGTH };
    if (phase < 1 || phase > 4) return { ok: false, value: ERR_INVALID_PHASE_RANGE };
    if (patientCount < 1 || patientCount > 10000) return { ok: false, value: ERR_INVALID_PATIENT_RANGE };
    if (outcomeMetric < 0 || outcomeMetric > 100) return { ok: false, value: ERR_INVALID_OUTCOME_RANGE };
    if (!["raw", "aggregated", "anonymized"].includes(dataType)) return { ok: false, value: ERR_INVALID_DATA_TYPE_OPTION };
    if (metadata.length > 512) return { ok: false, value: ERR_INVALID_METADATA_LENGTH };
    if (!this.isVerifiedAuthority(this.caller).value) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const hashKey = dataHash.toString();
    if (this.state.submissionsByHash.has(hashKey)) return { ok: false, value: ERR_SUBMISSION_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_SET };

    this.stxTransfers.push({ amount: this.state.submissionFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextSubmissionId;
    const submission: Submission = {
      trialId,
      dataHash,
      description,
      timestamp: this.blockHeight,
      submitter: this.caller,
      status: true,
      phase,
      patientCount,
      outcomeMetric,
      dataType,
      metadata,
    };
    this.state.submissions.set(id, submission);
    this.state.submissionsByHash.set(hashKey, id);
    this.state.nextSubmissionId++;
    return { ok: true, value: id };
  }

  getSubmission(id: number): Submission | null {
    return this.state.submissions.get(id) || null;
  }

  updateSubmission(id: number, updateDescription: string, updateStatus: boolean): Result<boolean> {
    const submission = this.state.submissions.get(id);
    if (!submission) return { ok: false, value: false };
    if (submission.submitter !== this.caller) return { ok: false, value: false };
    if (!updateDescription || updateDescription.length > 256) return { ok: false, value: false };

    const updated: Submission = {
      ...submission,
      description: updateDescription,
      status: updateStatus,
      timestamp: this.blockHeight,
    };
    this.state.submissions.set(id, updated);
    this.state.submissionUpdates.set(id, {
      updateDescription,
      updateStatus,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  verifySubmissionHash(id: number, providedHash: Uint8Array): Result<boolean> {
    const submission = this.state.submissions.get(id);
    if (!submission) return { ok: false, value: false };
    return { ok: true, value: submission.dataHash.toString() === providedHash.toString() };
  }

  getSubmissionCount(): Result<number> {
    return { ok: true, value: this.state.nextSubmissionId };
  }

  checkSubmissionExistence(hash: Uint8Array): Result<boolean> {
    return { ok: true, value: this.state.submissionsByHash.has(hash.toString()) };
  }
}

describe("DataSubmission", () => {
  let contract: DataSubmissionMock;

  beforeEach(() => {
    contract = new DataSubmissionMock();
    contract.reset();
  });

  it("submits data successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = new Uint8Array(32).fill(1);
    const result = contract.submitData(
      1,
      dataHash,
      "Test Description",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const submission = contract.getSubmission(0);
    expect(submission?.trialId).toBe(1);
    expect(submission?.dataHash.toString()).toBe(dataHash.toString());
    expect(submission?.description).toBe("Test Description");
    expect(submission?.phase).toBe(1);
    expect(submission?.patientCount).toBe(100);
    expect(submission?.outcomeMetric).toBe(80);
    expect(submission?.dataType).toBe("raw");
    expect(submission?.metadata).toBe("Test Metadata");
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate data hashes", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = new Uint8Array(32).fill(1);
    contract.submitData(
      1,
      dataHash,
      "Test Description",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    const result = contract.submitData(
      2,
      dataHash,
      "Another Description",
      2,
      200,
      90,
      "aggregated",
      "Another Metadata"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_SUBMISSION_ALREADY_EXISTS);
  });

  it("rejects non-authorized caller", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2FAKE";
    contract.authorities = new Set();
    const dataHash = new Uint8Array(32).fill(1);
    const result = contract.submitData(
      1,
      dataHash,
      "Test Description",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects submission without authority contract", () => {
    const dataHash = new Uint8Array(32).fill(1);
    const result = contract.submitData(
      1,
      dataHash,
      "NoAuth",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });

  it("rejects invalid trial id", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = new Uint8Array(32).fill(1);
    const result = contract.submitData(
      0,
      dataHash,
      "InvalidTrial",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TRIAL_ID);
  });

  it("rejects invalid data hash length", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = new Uint8Array(31).fill(1);
    const result = contract.submitData(
      1,
      dataHash,
      "InvalidHash",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH_LENGTH);
  });

  it("rejects invalid data type", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = new Uint8Array(32).fill(1);
    const result = contract.submitData(
      1,
      dataHash,
      "InvalidType",
      1,
      100,
      80,
      "invalid",
      "Test Metadata"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DATA_TYPE_OPTION);
  });

  it("updates a submission successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = new Uint8Array(32).fill(1);
    contract.submitData(
      1,
      dataHash,
      "Old Description",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    const result = contract.updateSubmission(0, "New Description", false);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const submission = contract.getSubmission(0);
    expect(submission?.description).toBe("New Description");
    expect(submission?.status).toBe(false);
    const update = contract.state.submissionUpdates.get(0);
    expect(update?.updateDescription).toBe("New Description");
    expect(update?.updateStatus).toBe(false);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent submission", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateSubmission(99, "New Description", false);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-submitter", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = new Uint8Array(32).fill(1);
    contract.submitData(
      1,
      dataHash,
      "Test Description",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateSubmission(0, "New Description", false);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets submission fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setSubmissionFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.submissionFee).toBe(1000);
    const dataHash = new Uint8Array(32).fill(1);
    contract.submitData(
      1,
      dataHash,
      "Test Description",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects submission fee change without authority contract", () => {
    const result = contract.setSubmissionFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct submission count", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash1 = new Uint8Array(32).fill(1);
    const dataHash2 = new Uint8Array(32).fill(2);
    contract.submitData(
      1,
      dataHash1,
      "Description1",
      1,
      100,
      80,
      "raw",
      "Metadata1"
    );
    contract.submitData(
      2,
      dataHash2,
      "Description2",
      2,
      200,
      90,
      "aggregated",
      "Metadata2"
    );
    const result = contract.getSubmissionCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks submission existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = new Uint8Array(32).fill(1);
    contract.submitData(
      1,
      dataHash,
      "Test Description",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    const result = contract.checkSubmissionExistence(dataHash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const fakeHash = new Uint8Array(32).fill(3);
    const result2 = contract.checkSubmissionExistence(fakeHash);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("verifies submission hash correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = new Uint8Array(32).fill(1);
    contract.submitData(
      1,
      dataHash,
      "Test Description",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    const result = contract.verifySubmissionHash(0, dataHash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const fakeHash = new Uint8Array(32).fill(2);
    const result2 = contract.verifySubmissionHash(0, fakeHash);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects submission with empty description", () => {
    contract.setAuthorityContract("ST2TEST");
    const dataHash = new Uint8Array(32).fill(1);
    const result = contract.submitData(
      1,
      dataHash,
      "",
      1,
      100,
      80,
      "raw",
      "Test Metadata"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DESCRIPTION_LENGTH);
  });

  it("rejects submission with max submissions exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxSubmissions = 1;
    const dataHash1 = new Uint8Array(32).fill(1);
    contract.submitData(
      1,
      dataHash1,
      "Description1",
      1,
      100,
      80,
      "raw",
      "Metadata1"
    );
    const dataHash2 = new Uint8Array(32).fill(2);
    const result = contract.submitData(
      2,
      dataHash2,
      "Description2",
      2,
      200,
      90,
      "aggregated",
      "Metadata2"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_SUBMISSIONS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects verify for non-existent submission", () => {
    const fakeHash = new Uint8Array(32).fill(1);
    const result = contract.verifySubmissionHash(99, fakeHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});