import * as adminApp from "firebase-admin/app";
import * as firestoreSdk from "firebase-admin/firestore";
import * as authSdk from "firebase-admin/auth";
import * as storageSdk from "firebase-admin/storage";
import { getAdminApp, db, auth, storage } from "../../firebase";

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(),
  initializeApp: jest.fn(),
  applicationDefault: jest.fn(() => "adc"),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({ name: "firestore-instance" })),
}));

jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({ name: "auth-instance" })),
}));

jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn(() => ({ name: "storage-instance" })),
}));

describe("firebase module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("initialisiert App genau einmal", () => {
    const getApps = adminApp.getApps as jest.Mock;
    getApps.mockReturnValueOnce([]);
    getApps.mockReturnValue([{}]);

    getAdminApp();
    getAdminApp();

    expect(adminApp.initializeApp).toHaveBeenCalledTimes(1);
  });

  it("liefert lazy getter für Firestore/Auth/Storage", () => {
    const getApps = adminApp.getApps as jest.Mock;
    getApps.mockReturnValue([{}]);

    expect(db()).toEqual({ name: "firestore-instance" });
    expect(auth()).toEqual({ name: "auth-instance" });
    expect(storage()).toEqual({ name: "storage-instance" });

    expect(firestoreSdk.getFirestore).toHaveBeenCalledTimes(1);
    expect(authSdk.getAuth).toHaveBeenCalledTimes(1);
    expect(storageSdk.getStorage).toHaveBeenCalledTimes(1);
  });
});
