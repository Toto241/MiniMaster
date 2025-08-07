import "mocha";
import * as sinon from "sinon";
import { expect } from "chai";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as fft from "firebase-functions-test";

// Initialize firebase-functions-test
const testEnv = fft();

describe("Cloud Functions", () => {
  let adminInitStub: sinon.SinonStub;
  let firestoreStub: sinon.SinonStub;
  let db: admin.firestore.Firestore;
  let myFunctions: any;

  before(() => {
    // Stub admin.initializeApp and admin.firestore
    adminInitStub = sinon.stub(admin, "initializeApp");

    // Create a stub for the firestore instance
    db = admin.firestore(); // This is now a stubbed instance
    firestoreStub = sinon.stub(admin, "firestore").returns(db);

    // Import the functions AFTER stubbing
    myFunctions = require("../index");
  });

  after(() => {
    // Clean up stubs
    adminInitStub.restore();
    firestoreStub.restore();
    testEnv.cleanup();
  });

  describe("createPairingCode", () => {
    let collectionStub: sinon.SinonStub;
    let docStub: sinon.SinonStub;
    let getStub: sinon.SinonStub;
    let setStub: sinon.SinonStub;

    beforeEach(() => {
      setStub = sinon.stub();
      getStub = sinon.stub();
      docStub = sinon.stub().returns({
        get: getStub,
        set: setStub,
      });
      collectionStub = sinon.stub(db, "collection").returns({
        doc: docStub,
      } as any);
    });

    afterEach(() => {
      collectionStub.restore();
    });

    it("should create a unique pairing code successfully", async () => {
      getStub.resolves({ exists: false });
      setStub.resolves();

      const wrapped = testEnv.wrap(myFunctions.createPairingCode);
      const result = await wrapped({ childId: "test-child-123" });

      expect(result).to.have.property("pairingCode");
      expect(result.pairingCode).to.be.a("string").with.lengthOf(6);
      expect(collectionStub.calledWith("pairingCodes")).to.be.true;
      expect(setStub.calledOnce).to.be.true;
    });

    it("should handle collision and retry", async () => {
      // First call to get() finds an existing doc, second finds none
      getStub.onFirstCall().resolves({ exists: true });
      getStub.onSecondCall().resolves({ exists: false });
      setStub.resolves();

      const wrapped = testEnv.wrap(myFunctions.createPairingCode);
      const result = await wrapped({ childId: "test-child-456" });

      expect(result).to.have.property("pairingCode");
      expect(getStub.calledTwice).to.be.true; // Called once for collision, once for success
      expect(setStub.calledOnce).to.be.true;
    });

    it("should throw 'invalid-argument' if childId is missing", async () => {
      const wrapped = testEnv.wrap(myFunctions.createPairingCode);
      try {
        await wrapped({});
        expect.fail("Function should have thrown an error");
      } catch (error: any) {
        expect(error.code).to.equal("invalid-argument");
        expect(error.message).to.contain("childId");
      }
    });

    it("should throw 'resource-exhausted' after max attempts", async () => {
      // Always find an existing document
      getStub.resolves({ exists: true });

      const wrapped = testEnv.wrap(myFunctions.createPairingCode);
      try {
        await wrapped({ childId: "test-child-789" });
        expect.fail("Function should have thrown an error");
      } catch (error: any) {
        expect(error.code).to.equal("resource-exhausted");
        expect(getStub.callCount).to.equal(10); // Default maxAttempts
      }
    });
  });

  describe("validatePairingCode", () => {
    let collectionStub: sinon.SinonStub;
    let docStub: sinon.SinonStub;
    let getStub: sinon.SinonStub;
    let deleteStub: sinon.SinonStub;

    beforeEach(() => {
        deleteStub = sinon.stub().resolves();
        getStub = sinon.stub();
        docStub = sinon.stub().returns({
            get: getStub,
            delete: deleteStub,
        });
        collectionStub = sinon.stub(db, "collection").returns({
            doc: docStub,
        } as any);
    });

    afterEach(() => {
        collectionStub.restore();
    });

    it("should validate a correct code and return childId", async () => {
        const future = new Date();
        future.setHours(future.getHours() + 1);
        const expiresAt = admin.firestore.Timestamp.fromDate(future);

        getStub.resolves({
            exists: true,
            data: () => ({
                childId: "validated-child-id",
                expiresAt: expiresAt,
            }),
        });

        const wrapped = testEnv.wrap(myFunctions.validatePairingCode);
        const result = await wrapped({ pairingCode: "123456" });

        expect(result).to.deep.equal({ childId: "validated-child-id" });
        expect(deleteStub.calledOnce).to.be.true;
    });

    it("should throw 'not-found' for an invalid code", async () => {
        getStub.resolves({ exists: false });

        const wrapped = testEnv.wrap(myFunctions.validatePairingCode);
        try {
            await wrapped({ pairingCode: "000000" });
            expect.fail("Function should have thrown");
        } catch (error: any) {
            expect(error.code).to.equal("not-found");
            expect(deleteStub.called).to.be.false;
        }
    });

    it("should throw 'deadline-exceeded' for an expired code", async () => {
        const past = new Date();
        past.setHours(past.getHours() - 1);
        const expiresAt = admin.firestore.Timestamp.fromDate(past);

        getStub.resolves({
            exists: true,
            data: () => ({
                childId: "expired-child-id",
                expiresAt: expiresAt,
            }),
        });

        const wrapped = testEnv.wrap(myFunctions.validatePairingCode);
        try {
            await wrapped({ pairingCode: "111222" });
            expect.fail("Function should have thrown");
        } catch (error: any) {
            expect(error.code).to.equal("deadline-exceeded");
            expect(deleteStub.calledOnce).to.be.true; // Should delete expired codes
        }
    });
  });
});
