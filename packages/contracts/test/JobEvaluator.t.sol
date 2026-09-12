// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {JobEvaluator, IArcEscrow} from "../src/JobEvaluator.sol";
import {Vm} from "./ProbeReceiver.t.sol";

contract TestEscrow is IArcEscrow {
    Job private job;
    bool public fail;

    function setJob(Job memory value) external {
        job = value;
    }

    function setFail(bool value) external {
        fail = value;
    }

    function getJob(uint256) external view returns (Job memory) {
        return job;
    }

    function complete(uint256, bytes32, bytes calldata) external {
        require(!fail);
        require(msg.sender == job.evaluator);
        job.status = 3;
    }

    function reject(uint256, bytes32, bytes calldata) external {
        require(!fail);
        require(msg.sender == job.evaluator);
        job.status = 4;
    }
}

contract JobEvaluatorTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant FORWARDER = address(0x1234);
    TestEscrow escrow;
    JobEvaluator evaluator;
    JobEvaluator.Report r;

    function setUp() public {
        escrow = new TestEscrow();
        evaluator = new JobEvaluator(FORWARDER, address(escrow));
        escrow.setJob(
            IArcEscrow.Job(
                1,
                address(1),
                address(2),
                address(evaluator),
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                10000,
                block.timestamp + 600,
                2,
                address(0)
            )
        );
        r = JobEvaluator.Report(
            1,
            block.chainid,
            address(escrow),
            address(evaluator),
            1,
            bytes32(uint256(1)),
            bytes32(uint256(2)),
            1,
            block.timestamp + 300
        );
    }

    function send() internal {
        vm.prank(FORWARDER);
        evaluator.onReport("", abi.encode(r));
    }

    function testAccept() public {
        send();
        require(escrow.getJob(1).status == 3);
    }

    function testReject() public {
        r.decision = 2;
        send();
        require(escrow.getJob(1).status == 4);
    }

    function testCaller() public {
        vm.expectRevert(JobEvaluator.InvalidForwarder.selector);
        evaluator.onReport("", abi.encode(r));
    }

    function testReplay() public {
        send();
        vm.expectRevert(JobEvaluator.Replay.selector);
        send();
    }

    function testChain() public {
        r.chainId++;
        vm.expectRevert(JobEvaluator.InvalidReport.selector);
        send();
    }

    function testDestination() public {
        r.receiver = address(3);
        vm.expectRevert(JobEvaluator.InvalidReport.selector);
        send();
    }

    function testEscrow() public {
        r.escrow = address(3);
        vm.expectRevert(JobEvaluator.InvalidReport.selector);
        send();
    }

    function testJob() public {
        r.jobId++;
        vm.expectRevert(JobEvaluator.InvalidReport.selector);
        send();
    }

    function testManifest() public {
        r.manifestHash = bytes32(uint256(3));
        vm.expectRevert(JobEvaluator.InvalidReport.selector);
        send();
    }

    function testDecision() public {
        r.decision = 3;
        vm.expectRevert(JobEvaluator.InvalidReport.selector);
        send();
    }

    function testExpiryBoundary() public {
        vm.warp(r.validUntil);
        vm.expectRevert(JobEvaluator.InvalidReport.selector);
        send();
    }

    function testJobExpiry() public {
        r.validUntil = block.timestamp + 700;
        vm.expectRevert(JobEvaluator.InvalidReport.selector);
        send();
    }

    function testMalformed() public {
        vm.prank(FORWARDER);
        vm.expectRevert(JobEvaluator.InvalidReport.selector);
        evaluator.onReport("", hex"00");
    }

    function testRollbackAllowsRetry() public {
        escrow.setFail(true);
        vm.expectRevert();
        send();
        require(!evaluator.processed(keccak256(abi.encode(r))));
        escrow.setFail(false);
        send();
    }

    function testWrongState() public {
        IArcEscrow.Job memory j = escrow.getJob(1);
        j.status = 1;
        escrow.setJob(j);
        vm.expectRevert(JobEvaluator.InvalidReport.selector);
        send();
    }

    function testWrongEvaluator() public {
        IArcEscrow.Job memory j = escrow.getJob(1);
        j.evaluator = address(5);
        escrow.setJob(j);
        vm.expectRevert(JobEvaluator.InvalidReport.selector);
        send();
    }
}
