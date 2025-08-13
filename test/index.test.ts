import "mocha";
import * as sinon from "sinon";
import { expect } from "chai";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import fft from "firebase-functions-test";

// Initialize firebase-functions-test
const testEnv = fft();

describe("Cloud Functions", () => {
  let db: admin.firestore.Firestore;
  let myFunctions: any;

  before(() => {
    // Initialize the SDK and get a stubbed firestore instance
    testEnv.mockConfig({ firestore: { "host": "localhost", "port": "8080" } }); // Mock config to prevent network calls
    myFunctions = require("../index");
    db = admin.firestore(); // Get the firestore instance AFTER require
  });

  after(() => {
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

  describe("validatePairingToken", () => {
    let collectionStub: sinon.SinonStub;
    let docStub: sinon.SinonStub;
    let getStub: sinon.SinonStub;
    let setStub: sinon.SinonStub;
    let deleteStub: sinon.SinonStub;

    beforeEach(() => {
      setStub = sinon.stub().resolves();
      getStub = sinon.stub();
      deleteStub = sinon.stub().resolves();
      docStub = sinon.stub().returns({
        get: getStub,
        set: setStub,
        delete: deleteStub,
      });
      collectionStub = sinon.stub(db, "collection");
      collectionStub.withArgs("pairingTokens").returns({ doc: docStub } as any);
      collectionStub.withArgs("children").returns({ doc: docStub } as any);
    });

    afterEach(() => {
      collectionStub.restore();
    });

    it("should validate a token and create a child profile", async () => {
      const future = new Date();
      future.setMinutes(future.getMinutes() + 1);
      const expiresAt = admin.firestore.Timestamp.fromDate(future);
      getStub.resolves({
        exists: true,
        data: () => ({ masterImei: "parent-imei-123", expiresAt }),
      });

      const wrapped = testEnv.wrap(myFunctions.validatePairingToken);
      const result = await wrapped({ pairingToken: "valid-token", childImei: "child-imei-456" });

      expect(result).to.deep.equal({ childId: "parent-imei-123" });
      expect(collectionStub.calledWith("children")).to.be.true;
      expect(setStub.calledOnce).to.be.true;
      expect(deleteStub.calledOnce).to.be.true; // Token should be deleted
    });

    it("should throw 'not-found' for an invalid token", async () => {
      getStub.resolves({ exists: false });
      const wrapped = testEnv.wrap(myFunctions.validatePairingToken);
      try {
        await wrapped({ pairingToken: "invalid-token", childImei: "child-imei" });
        expect.fail("Function should have thrown");
      } catch(e: any) {
        expect(e.code).to.equal("not-found");
      }
    });

    it("should throw 'deadline-exceeded' for an expired token", async () => {
      const past = new Date();
      past.setMinutes(past.getMinutes() - 1);
      const expiresAt = admin.firestore.Timestamp.fromDate(past);
      getStub.resolves({
        exists: true,
        data: () => ({ masterImei: "parent-imei-123", expiresAt }),
      });

      const wrapped = testEnv.wrap(myFunctions.validatePairingToken);
      try {
        await wrapped({ pairingToken: "expired-token", childImei: "child-imei" });
        expect.fail("Function should have thrown");
      } catch(e: any) {
        expect(e.code).to.equal("deadline-exceeded");
        expect(deleteStub.calledOnce).to.be.true; // Expired token should be deleted
      }
    });
  });

  describe("generatePairingLink", () => {
    let collectionStub: sinon.SinonStub;
    let docStub: sinon.SinonStub;
    let getStub: sinon.SinonStub;
    let setStub: sinon.SinonStub;

    beforeEach(() => {
      setStub = sinon.stub().resolves();
      getStub = sinon.stub();
      docStub = sinon.stub().returns({
        get: getStub,
        set: setStub,
      });
      // Point the stub to the correct collections based on the call
      collectionStub = sinon.stub(db, "collection");
      collectionStub.withArgs("masters").returns({ doc: docStub } as any);
      collectionStub.withArgs("pairingTokens").returns({ doc: docStub } as any);
    });

    afterEach(() => {
      collectionStub.restore();
    });

    it("should generate a token for an authenticated user", async () => {
      // Mock the master device document
      getStub.resolves({
        exists: true,
        data: () => ({ secretKey: "correct-secret-key" }),
      });

      const wrapped = testEnv.wrap(myFunctions.generatePairingLink);
      const result = await wrapped({ imei: "auth-imei", secretKey: "correct-secret-key" });

      expect(result).to.have.property("pairingToken");
      expect(result.pairingToken).to.be.a("string");
      expect(collectionStub.calledWith("masters")).to.be.true;
      expect(collectionStub.calledWith("pairingTokens")).to.be.true;
      expect(setStub.calledOnce).to.be.true;
      const tokenData = setStub.firstCall.args[0];
      expect(tokenData).to.have.property("masterImei", "auth-imei");
    });

    it("should throw 'unauthenticated' for a wrong secret key", async () => {
      getStub.resolves({
        exists: true,
        data: () => ({ secretKey: "correct-secret-key" }),
      });

      const wrapped = testEnv.wrap(myFunctions.generatePairingLink);
      try {
        await wrapped({ imei: "auth-imei", secretKey: "wrong-secret-key" });
        expect.fail("Function should have thrown");
      } catch (error: any) {
        expect(error.code).to.equal("unauthenticated");
      }
    });

    it("should throw 'unauthenticated' for a non-existent device", async () => {
      getStub.resolves({ exists: false });

      const wrapped = testEnv.wrap(myFunctions.generatePairingLink);
      try {
        await wrapped({ imei: "non-existent-imei", secretKey: "any-key" });
        expect.fail("Function should have thrown");
      } catch (error: any) {
        expect(error.code).to.equal("unauthenticated");
      }
    });

    it("should throw 'invalid-argument' if imei or secretKey is missing", async () => {
      const wrapped = testEnv.wrap(myFunctions.generatePairingLink);
      try {
        await wrapped({ imei: "some-imei" }); // Missing secretKey
        expect.fail("Function should have thrown");
      } catch (error: any) {
        expect(error.code).to.equal("invalid-argument");
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

  describe("registerMasterDevice", () => {
    let collectionStub: sinon.SinonStub;
    let docStub: sinon.SinonStub;
    let getStub: sinon.SinonStub;
    let setStub: sinon.SinonStub;

    beforeEach(() => {
      setStub = sinon.stub().resolves();
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

    it("should register a new device and return a secret key", async () => {
      getStub.resolves({ exists: false });
      const wrapped = testEnv.wrap(myFunctions.registerMasterDevice);
      const result = await wrapped({ imei: "new-device-imei" });

      expect(result).to.have.property("secretKey");
      expect(result.secretKey).to.be.a("string");
      expect(collectionStub.calledWith("masters")).to.be.true;
      expect(docStub.calledWith("new-device-imei")).to.be.true;
      expect(setStub.calledOnce).to.be.true;
      const setData = setStub.firstCall.args[0];
      expect(setData).to.have.property("imei", "new-device-imei");
      expect(setData).to.have.property("secretKey");
    });

    it("should throw 'already-exists' if the device is already registered", async () => {
      getStub.resolves({ exists: true });
      const wrapped = testEnv.wrap(myFunctions.registerMasterDevice);

      try {
        await wrapped({ imei: "existing-device-imei" });
        expect.fail("Function should have thrown");
      } catch (error: any) {
        expect(error.code).to.equal("already-exists");
        expect(setStub.called).to.be.false;
      }
    });

    it("should throw 'invalid-argument' if imei is missing", async () => {
      const wrapped = testEnv.wrap(myFunctions.registerMasterDevice);
      try {
        await wrapped({});
        expect.fail("Function should have thrown");
      } catch (error: any) {
        expect(error.code).to.equal("invalid-argument");
        expect(error.message).to.contain("imei");
      }
    });
  });

  describe("setDeviceLocked", () => {
    let collectionStub: sinon.SinonStub;
    let docStub: sinon.SinonStub;
    let getStub: sinon.SinonStub;
    let updateStub: sinon.SinonStub;

    beforeEach(() => {
      updateStub = sinon.stub().resolves();
      getStub = sinon.stub();
      docStub = sinon.stub().returns({
        get: getStub,
        update: updateStub,
      });
      collectionStub = sinon.stub(db, "collection");
    });

    afterEach(() => {
      collectionStub.restore();
    });

    it("should lock a device for an authorized master", async () => {
      const masterGetStub = sinon.stub().resolves({ exists: true, data: () => ({ secretKey: "master-secret" }) });
      const masterDocStub = sinon.stub().returns({ get: masterGetStub });
      collectionStub.withArgs("masters").returns({ doc: masterDocStub } as any);

      const childGetStub = sinon.stub().resolves({ exists: true, data: () => ({ masterImei: "test-master" }) });
      const childDocStub = sinon.stub().returns({ get: childGetStub, update: updateStub });
      collectionStub.withArgs("children").returns({ doc: childDocStub } as any);

      const wrapped = testEnv.wrap(myFunctions.setDeviceLocked);
      const result = await wrapped({
        masterImei: "test-master",
        secretKey: "master-secret",
        childImei: "test-child",
        isLocked: true,
      });

      expect(result).to.deep.equal({ success: true, isLocked: true });
      expect(updateStub.calledOnceWith(sinon.match({ isLocked: true }))).to.be.true;
    });

    it("should throw 'unauthenticated' if master secret is wrong", async () => {
      collectionStub.withArgs("masters").returns({ doc: docStub } as any);
      getStub.resolves({ exists: true, data: () => ({ secretKey: "correct-secret" }) });

      const wrapped = testEnv.wrap(myFunctions.setDeviceLocked);
      try {
        await wrapped({
          masterImei: "test-master",
          secretKey: "wrong-secret",
          childImei: "test-child",
          isLocked: true,
        });
        expect.fail("Function should have thrown");
      } catch (error: any) {
        expect(error.code).to.equal("unauthenticated");
      }
    });

    it("should throw 'permission-denied' if child does not belong to master", async () => {
      collectionStub.withArgs("masters").returns({ doc: docStub } as any);
      collectionStub.withArgs("children").returns({ doc: docStub } as any);

      // Master is valid
      getStub.onFirstCall().resolves({ exists: true, data: () => ({ secretKey: "master-secret" }) });
      // Child belongs to a DIFFERENT master
      getStub.onSecondCall().resolves({ exists: true, data: () => ({ masterImei: "other-master" }) });

      const wrapped = testEnv.wrap(myFunctions.setDeviceLocked);
      try {
        await wrapped({
          masterImei: "test-master",
          secretKey: "master-secret",
          childImei: "test-child",
          isLocked: true,
        });
        expect.fail("Function should have thrown");
      } catch (error: any) {
        expect(error.code).to.equal("permission-denied");
      }
    });
  });

  describe("createTask", () => {
    let collectionStub: sinon.SinonStub;
    let docStub: sinon.SinonStub;
    let getStub: sinon.SinonStub;
    let setStub: sinon.SinonStub;

    beforeEach(() => {
      setStub = sinon.stub().resolves();
      getStub = sinon.stub();
      // This is a bit tricky because we have a subcollection.
      // We need to stub the collection call on the document reference.
      const subCollectionStub = sinon.stub().returns({ doc: () => ({ set: setStub }) });
      docStub = sinon.stub().returns({
        get: getStub,
        collection: subCollectionStub,
      });
      collectionStub = sinon.stub(db, "collection").returns({
        doc: docStub,
      } as any);
    });

    afterEach(() => {
      collectionStub.restore();
    });

    it("should create a task for an authorized master", async () => {
      getStub.onFirstCall().resolves({ exists: true, data: () => ({ secretKey: "master-secret" }) });
      getStub.onSecondCall().resolves({ exists: true, data: () => ({ masterImei: "test-master" }) });

      const wrapped = testEnv.wrap(myFunctions.createTask);
      const result = await wrapped({
        masterImei: "test-master",
        secretKey: "master-secret",
        childImei: "test-child",
        description: "Do your homework",
        deadlineISO: new Date().toISOString(),
      });

      expect(result.success).to.be.true;
      expect(result).to.have.property("taskId");
      expect(setStub.calledOnce).to.be.true;
      const taskData = setStub.firstCall.args[0];
      expect(taskData.description).to.equal("Do your homework");
      expect(taskData.status).to.equal("pending");
    });
  });

  describe("approveTask", () => {
    it("should approve a task for an authorized master", async () => {
        const updateStub = sinon.stub().resolves();
        const getStub = sinon.stub();
        getStub.onFirstCall().resolves({ exists: true, data: () => ({ secretKey: "master-secret" }) });
        getStub.onSecondCall().resolves({ exists: true, data: () => ({ masterImei: "test-master" }) });
        const subCollectionStub = sinon.stub().returns({ doc: () => ({ update: updateStub }) });
        const docStub = sinon.stub().returns({ get: getStub, collection: subCollectionStub });
        const collectionStub = sinon.stub(db, "collection").returns({ doc: docStub } as any);

        const wrapped = testEnv.wrap(myFunctions.approveTask);
        const result = await wrapped({
            masterImei: "test-master",
            secretKey: "master-secret",
            childImei: "test-child",
            taskId: "test-task",
        });

        expect(result.success).to.be.true;
        expect(updateStub.calledOnceWith({ status: "approved" })).to.be.true;
        collectionStub.restore();
    });
  });

  describe("completeTask", () => {
    it("should mark a task as pending_approval", async () => {
        const updateStub = sinon.stub().resolves();
        const getStub = sinon.stub().resolves({ exists: true });
        const docStub = sinon.stub().returns({ get: getStub, update: updateStub });
        const subCollectionStub = sinon.stub().returns({ doc: docStub });
        const collectionStub = sinon.stub(db, "collection").returns({ collection: subCollectionStub, doc: () => ({ collection: subCollectionStub }) } as any);

        const wrapped = testEnv.wrap(myFunctions.completeTask);
        const result = await wrapped({
            childImei: "test-child",
            taskId: "test-task",
            photoUrl: "http://example.com/photo.jpg",
        });

        expect(result.success).to.be.true;
        expect(updateStub.calledOnce).to.be.true;
        expect(updateStub.firstCall.args[0].status).to.equal("pending_approval");
        expect(updateStub.firstCall.args[0].photoUrl).to.equal("http://example.com/photo.jpg");
        collectionStub.restore();
    });
  });

  describe("recordHeartbeat", () => {
      it("should update the lastSeen field", async () => {
          const updateStub = sinon.stub().resolves();
          const getStub = sinon.stub().resolves({exists: true});
          const docStub = sinon.stub().returns({ get: getStub, update: updateStub });
          const collectionStub = sinon.stub(db, "collection").returns({ doc: docStub } as any);

          const wrapped = testEnv.wrap(myFunctions.recordHeartbeat);
          await wrapped({ childImei: "test-child" });

          expect(updateStub.calledOnce).to.be.true;
          expect(updateStub.firstCall.args[0]).to.have.property("lastSeen");
          collectionStub.restore();
      });
  });
});
