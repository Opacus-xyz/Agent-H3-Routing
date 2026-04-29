import { expect } from "chai";
import { ethers } from "hardhat";
import type { ERC8242SpatialRegistry } from "../typechain-types";

const H3_INDEX_RES5 = "8928308280fffff";
const H3_INDEX_RES7 = "89283082803ffff";
const H3_PARENT     = "8928308280";

// Match the solidity enum order
const Local    = 0;
const Regional = 1;
const Global   = 2;

describe("ERC8242SpatialRegistry", function () {
  let registry: ERC8242SpatialRegistry;
  let owner: ReturnType<typeof ethers.getSigners> extends Promise<infer T> ? T[number] : never;
  let alice: typeof owner;
  let bob:   typeof owner;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ERC8242SpatialRegistry");
    registry = (await Factory.deploy()) as ERC8242SpatialRegistry;
    await registry.waitForDeployment();
  });

  // ── ERC-165 ──────────────────────────────────────────────────────────────

  describe("ERC-165", function () {
    it("supports IERC8242 interface", async function () {
      // 4-byte XOR of all IERC8242 selectors
      const IERC8242_ID = "0x4e6c7ff4";
      expect(await registry.supportsInterface(IERC8242_ID)).to.equal(true);
    });

    it("supports IERC165 interface", async function () {
      expect(await registry.supportsInterface("0x01ffc9a7")).to.equal(true);
    });

    it("does not support random interface", async function () {
      expect(await registry.supportsInterface("0xdeadbeef")).to.equal(false);
    });
  });

  // ── registerSpatial ───────────────────────────────────────────────────────

  describe("registerSpatial", function () {
    it("registers a new record and emits SpatialRegistered", async function () {
      await expect(registry.connect(alice).registerSpatial(H3_INDEX_RES5, 5, Local))
        .to.emit(registry, "SpatialRegistered")
        .withArgs(alice.address, H3_INDEX_RES5, Local);

      const rec = await registry.getSpatial(alice.address);
      expect(rec.agent).to.equal(alice.address);
      expect(rec.h3Index).to.equal(H3_INDEX_RES5);
      expect(rec.resolution).to.equal(5);
      expect(rec.preference).to.equal(Local);
    });

    it("sets registeredAt and updatedAt to block.timestamp", async function () {
      const tx     = await registry.connect(alice).registerSpatial(H3_INDEX_RES5, 5, Local);
      const receipt = await tx.wait();
      const block  = await ethers.provider.getBlock(receipt!.blockNumber);
      const rec    = await registry.getSpatial(alice.address);
      expect(rec.registeredAt).to.equal(BigInt(block!.timestamp));
      expect(rec.updatedAt).to.equal(BigInt(block!.timestamp));
    });

    it("reverts on empty h3Index", async function () {
      await expect(registry.connect(alice).registerSpatial("", 5, Local))
        .to.be.revertedWith("ERC8242: empty h3Index");
    });

    it("reverts on duplicate registration", async function () {
      await registry.connect(alice).registerSpatial(H3_INDEX_RES5, 5, Local);
      await expect(registry.connect(alice).registerSpatial(H3_INDEX_RES5, 5, Local))
        .to.be.revertedWith("ERC8242: already registered");
    });

    it("reverts if resolution > 15", async function () {
      await expect(registry.connect(alice).registerSpatial(H3_INDEX_RES5, 16, Local))
        .to.be.revertedWith("ERC8242: resolution out of range");
    });
  });

  // ── updateSpatial ─────────────────────────────────────────────────────────

  describe("updateSpatial", function () {
    beforeEach(async function () {
      await registry.connect(alice).registerSpatial(H3_INDEX_RES5, 5, Local);
    });

    it("updates record and emits SpatialUpdated", async function () {
      await expect(registry.connect(alice).updateSpatial(H3_INDEX_RES7, 7, Regional))
        .to.emit(registry, "SpatialUpdated")
        .withArgs(alice.address, H3_INDEX_RES7, Regional);

      const rec = await registry.getSpatial(alice.address);
      expect(rec.h3Index).to.equal(H3_INDEX_RES7);
      expect(rec.resolution).to.equal(7);
      expect(rec.preference).to.equal(Regional);
    });

    it("does not change registeredAt", async function () {
      const before = (await registry.getSpatial(alice.address)).registeredAt;
      await registry.connect(alice).updateSpatial(H3_INDEX_RES7, 7, Regional);
      const after = (await registry.getSpatial(alice.address)).registeredAt;
      expect(after).to.equal(before);
    });

    it("reverts for unregistered caller", async function () {
      await expect(registry.connect(bob).updateSpatial(H3_INDEX_RES7, 7, Regional))
        .to.be.revertedWith("ERC8242: not registered");
    });
  });

  // ── deregisterSpatial ─────────────────────────────────────────────────────

  describe("deregisterSpatial", function () {
    beforeEach(async function () {
      await registry.connect(alice).registerSpatial(H3_INDEX_RES5, 5, Local);
    });

    it("removes record and emits SpatialDeregistered", async function () {
      await expect(registry.connect(alice).deregisterSpatial())
        .to.emit(registry, "SpatialDeregistered")
        .withArgs(alice.address);

      const rec = await registry.getSpatial(alice.address);
      expect(rec.agent).to.equal(ethers.ZeroAddress);
    });

    it("decrements totalRegistered", async function () {
      expect(await registry.totalRegistered()).to.equal(1n);
      await registry.connect(alice).deregisterSpatial();
      expect(await registry.totalRegistered()).to.equal(0n);
    });

    it("allows re-registration after deregistration", async function () {
      await registry.connect(alice).deregisterSpatial();
      await expect(registry.connect(alice).registerSpatial(H3_INDEX_RES5, 5, Global))
        .to.not.be.reverted;
    });

    it("reverts for unregistered caller", async function () {
      await expect(registry.connect(bob).deregisterSpatial())
        .to.be.revertedWith("ERC8242: not registered");
    });
  });

  // ── discoverAgents ────────────────────────────────────────────────────────

  describe("discoverAgents", function () {
    beforeEach(async function () {
      await registry.connect(alice).registerSpatial(H3_INDEX_RES5, 5, Local);
      await registry.connect(bob).registerSpatial(H3_INDEX_RES7, 7, Regional);
    });

    it("returns all agents when h3Parent is empty and preference is Global", async function () {
      const [records, total] = await registry.discoverAgents("", 0, Global, 0, 10);
      expect(total).to.equal(2n);
      expect(records.length).to.equal(2);
    });

    it("filters by preference", async function () {
      const [records, total] = await registry.discoverAgents("", 0, Local, 0, 10);
      expect(total).to.equal(1n);
      expect(records[0].agent).to.equal(alice.address);
    });

    it("filters by h3Parent prefix and resolution", async function () {
      const [records, total] = await registry.discoverAgents(H3_PARENT, 5, Global, 0, 10);
      expect(total).to.equal(1n);
      expect(records[0].agent).to.equal(alice.address);
    });

    it("respects pagination offset and limit", async function () {
      const [page1] = await registry.discoverAgents("", 0, Global, 0, 1);
      expect(page1.length).to.equal(1);
      const [page2] = await registry.discoverAgents("", 0, Global, 1, 1);
      expect(page2.length).to.equal(1);
      expect(page1[0].agent).to.not.equal(page2[0].agent);
    });

    it("returns empty array when offset exceeds total", async function () {
      const [records, total] = await registry.discoverAgents("", 0, Global, 100, 10);
      expect(total).to.equal(2n);
      expect(records.length).to.equal(0);
    });

    it("returns empty array when no records match", async function () {
      const [records, total] = await registry.discoverAgents("zzzzzzzzzzzzzz", 5, Global, 0, 10);
      expect(total).to.equal(0n);
      expect(records.length).to.equal(0);
    });
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  describe("isRegistered / totalRegistered", function () {
    it("returns false before registration", async function () {
      expect(await registry.isRegistered(alice.address)).to.equal(false);
    });

    it("returns true after registration", async function () {
      await registry.connect(alice).registerSpatial(H3_INDEX_RES5, 5, Local);
      expect(await registry.isRegistered(alice.address)).to.equal(true);
      expect(await registry.totalRegistered()).to.equal(1n);
    });
  });
});
